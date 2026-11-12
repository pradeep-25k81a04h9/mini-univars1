import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile as updateFirebaseProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { UserAccount, BearAvatarType } from '../types';
import { requireFirebase } from '../lib/firebase';

interface AuthContextType {
  currentUser: UserAccount | null;
  isLoading: boolean;
  register: (data: {
    name: string;
    nickname?: string;
    email: string;
    password: string;
    avatar: BearAvatarType;
    avatarUrl?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUserProfile: (data: { name: string; nickname: string; avatar: BearAvatarType }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function readableAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please log in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Choose a stronger password with at least 6 characters.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a little before trying again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your internet connection and try again.';
    case 'permission-denied':
    case 'firestore/permission-denied':
      return 'Firebase blocked this operation. Check that the Firestore security rules were published.';
    default:
      return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  }
}

function profileFromData(data: Record<string, unknown>, uid: string, email: string): UserAccount {
  return {
    id: uid,
    email,
    name: typeof data.name === 'string' ? data.name : 'New User',
    nickname: typeof data.nickname === 'string' ? data.nickname : (typeof data.name === 'string' ? data.name : 'New User'),
    avatar: data.avatar === 'bubu' || data.avatar === 'custom' ? data.avatar : 'dudu',
    avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : undefined,
    coupleId: typeof data.coupleId === 'string' ? data.coupleId : null,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    let activeUid: string | null = null;

    if (!requireFirebaseSafe()) {
      setIsLoading(false);
      return;
    }

    const { auth, db } = requireFirebase();
    const unsubscribeAuth = onAuthStateChanged(
      auth,
      async (firebaseUser: FirebaseUser | null) => {
        unsubscribeProfile?.();
        unsubscribeProfile = null;
        activeUid = firebaseUser?.uid ?? null;

        if (!firebaseUser) {
          setCurrentUser(null);
          setIsLoading(false);
          return;
        }

        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnapshot = await getDoc(userRef);

          // Recover a profile if a previous signup created the Auth account but
          // the browser closed before its profile document was written.
          if (!userSnapshot.exists()) {
            const fallbackName = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'New User';
            const recoveredProfile = {
              id: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: fallbackName,
              nickname: fallbackName,
              avatar: 'dudu' as BearAvatarType,
              coupleId: null,
              createdAt: new Date().toISOString(),
            };
            await setDoc(userRef, recoveredProfile);
          }

          if (activeUid !== firebaseUser.uid) return;
          unsubscribeProfile = onSnapshot(
            userRef,
            (snapshot) => {
              if (!snapshot.exists()) {
                setCurrentUser(null);
                return;
              }
              setCurrentUser(
                profileFromData(
                  snapshot.data() as Record<string, unknown>,
                  firebaseUser.uid,
                  firebaseUser.email || ''
                )
              );
            },
            (error) => {
              console.error('User profile listener failed:', error);
              setCurrentUser(null);
            }
          );
        } catch (error) {
          console.error('Could not load Firebase user profile:', error);
          setCurrentUser(null);
        } finally {
          if (activeUid === firebaseUser.uid) setIsLoading(false);
        }
      }
    );

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, []);

  const register: AuthContextType['register'] = async (data) => {
    try {
      const { auth, db } = requireFirebase();
      const credential = await createUserWithEmailAndPassword(
        auth,
        data.email.trim().toLowerCase(),
        data.password
      );

      await updateFirebaseProfile(credential.user, { displayName: data.name.trim() });

      const profile: UserAccount = {
        id: credential.user.uid,
        email: credential.user.email || data.email.trim().toLowerCase(),
        name: data.name.trim(),
        nickname: data.nickname?.trim() || data.name.trim(),
        avatar: data.avatar,
        ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
        coupleId: null,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', credential.user.uid), profile);
      return { success: true };
    } catch (error) {
      return { success: false, error: readableAuthError(error) };
    }
  };

  const login: AuthContextType['login'] = async (email, password) => {
    try {
      const { auth } = requireFirebase();
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      return { success: true };
    } catch (error) {
      return { success: false, error: readableAuthError(error) };
    }
  };

  const logout = async () => {
    const { auth } = requireFirebase();
    await signOut(auth);
    setCurrentUser(null);
  };

  const refreshUser = useCallback(async () => {
    const { auth, db } = requireFirebase();
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      setCurrentUser(null);
      return;
    }
    const snapshot = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (snapshot.exists()) {
      setCurrentUser(
        profileFromData(
          snapshot.data() as Record<string, unknown>,
          firebaseUser.uid,
          firebaseUser.email || ''
        )
      );
    }
  }, []);

  const updateUserProfile: AuthContextType['updateUserProfile'] = async (data) => {
    const { auth, db } = requireFirebase();
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) throw new Error('Please log in again to update your profile.');

    await updateDoc(doc(db, 'users', firebaseUser.uid), {
      name: data.name.trim(),
      nickname: data.nickname.trim(),
      avatar: data.avatar,
    });
    if (currentUser?.coupleId) {
      await updateDoc(doc(db, 'couples', currentUser.coupleId), {
        [`members.${firebaseUser.uid}.name`]: data.name.trim(),
        [`members.${firebaseUser.uid}.nickname`]: data.nickname.trim(),
        [`members.${firebaseUser.uid}.avatar`]: data.avatar,
      });
    }
    await updateFirebaseProfile(firebaseUser, { displayName: data.name.trim() });
    await refreshUser();
  };

  return (
    <AuthContext.Provider
      value={{ currentUser, isLoading, register, login, logout, refreshUser, updateUserProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};

function requireFirebaseSafe(): boolean {
  try {
    requireFirebase();
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
