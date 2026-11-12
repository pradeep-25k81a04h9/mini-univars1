import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useAuth } from './AuthContext';
import {
  CoupleSpace,
  ChatMessage,
  GalleryPhoto,
  CalendarEvent,
  SharedNote,
  BucketGoal,
  TravelDestination,
  MoodEntry,
  MoodType,
  LoveLetter,
  CoupleSong,
  QuizQuestion,
  DailyQuestion,
  SpecialDates,
} from '../types';
import { sounds } from '../utils/soundEffects';
import { db } from '../lib/firebase';

interface CallingState {
  active: boolean;
  incoming: boolean;
  type: 'voice' | 'video';
  callerName: string;
  duration: number;
}

interface CoupleContextType {
  coupleSpace: CoupleSpace | null;
  partner: { id: string; name: string; nickname: string; avatar: 'dudu' | 'bubu' | 'custom'; avatarUrl?: string } | null;
  isPaired: boolean;
  setupCompleted: boolean;
  isLoadingCouple: boolean;
  refreshCouple: () => Promise<void>;
  createCoupleSpace: () => Promise<{ success: boolean; couple?: CoupleSpace; error?: string }>;
  joinCoupleSpace: (inviteCode: string) => Promise<{ success: boolean; couple?: CoupleSpace; error?: string }>;
  completeSetup: (data: {
    firstMeetingDate: string;
    relationshipStartDate: string;
    specialDates?: SpecialDates;
    myNickname?: string;
    partnerNickname?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  updateRelationshipDates: (dates: {
    relationshipStartDate?: string;
    firstMeetingDate?: string;
    specialDates?: SpecialDates;
  }) => Promise<void>;
  messages: ChatMessage[];
  sendMessage: (msg: {
    text: string;
    type?: 'text' | 'image' | 'voice' | 'sticker' | 'love_note';
    mediaUrl?: string;
    stickerId?: string;
    voiceDuration?: number;
    loveNoteSubject?: string;
    replyToId?: string;
    replySnippet?: string;
    ciphertext?: string;
    iv?: string;
    isEncrypted?: boolean;
  }) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  photos: GalleryPhoto[];
  albums: { id: string; title: string; count: number }[];
  addPhoto: (photo: { url: string; caption: string; album: string; dateTaken: string }) => Promise<void>;
  deletePhoto: (id: string) => Promise<void>;
  toggleFavoritePhoto: (id: string) => Promise<void>;
  addPhotoComment: (photoId: string, text: string) => Promise<void>;
  calendarEvents: CalendarEvent[];
  addCalendarEvent: (event: {
    title: string;
    date: string;
    time?: string;
    description: string;
    category: any;
    location?: string;
    isDayToRemember?: boolean;
  }) => Promise<void>;
  deleteCalendarEvent: (id: string) => Promise<void>;
  notes: SharedNote[];
  addNote: (note: {
    title: string;
    content: string;
    category: any;
    priority: any;
    assignedTo: string;
    checklist?: any[];
    pinned?: boolean;
  }) => Promise<void>;
  updateNote: (id: string, updates: Partial<SharedNote>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  toggleChecklistItem: (noteId: string, itemId: string) => Promise<void>;
  bucketGoals: BucketGoal[];
  addBucketGoal: (goal: { title: string; category: string }) => Promise<void>;
  toggleBucketGoal: (id: string) => Promise<void>;
  deleteBucketGoal: (id: string) => Promise<void>;
  trips: TravelDestination[];
  addTrip: (trip: {
    title: string;
    destination: string;
    startDate: string;
    endDate: string;
    budget?: { estimated: number; spent: number };
    itinerary?: any[];
    packingList?: any[];
    hotelDetails?: string;
  }) => Promise<void>;
  toggleTripVisited: (id: string) => Promise<void>;
  togglePackingItem: (tripId: string, itemId: string) => Promise<void>;
  deleteTrip: (id: string) => Promise<void>;
  moods: MoodEntry[];
  todayMoods: { myMood?: MoodEntry; partnerMood?: MoodEntry };
  setTodayMood: (mood: MoodType, note?: string) => Promise<void>;
  loveLetters: LoveLetter[];
  addLoveLetter: (letter: { title: string; content: string; unlockDate: string }) => Promise<void>;
  openLoveLetter: (id: string) => Promise<void>;
  coupleSongs: CoupleSong[];
  addCoupleSong: (song: { title: string; artist: string; link?: string; platform: any; memoryNote?: string }) => Promise<void>;
  deleteCoupleSong: (id: string) => Promise<void>;
  currentDailyQuestion: DailyQuestion;
  answerDailyQuestion: (answer: string) => Promise<void>;
  quizQuestions: QuizQuestion[];
  answerQuizQuestion: (questionId: string, answerIndex: number) => Promise<void>;
  hugsCount: number;
  sendVirtualHug: () => Promise<void>;
  showHugAnimation: boolean;
  closeHugAnimation: () => void;
  callingState: CallingState;
  startCall: (type: 'voice' | 'video') => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  isLockedByPin: boolean;
  setPin: (pin: string | null) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  resetAllCoupleData: () => Promise<void>;
}

const CoupleContext = createContext<CoupleContextType | null>(null);

const DAILY_QUESTIONS_POOL = [
  'What was the very first thought you had when our eyes first met?',
  'What is your all-time favorite memory or date with me so far?',
  'What is a little thing I do without realizing that always warms your heart?',
  'If we had a completely free weekend together right now, what would our dream day look like?',
  'What song reminds you the most of our love story?',
  'What is one place in the entire world you cannot wait to explore holding my hand?',
  'How do you know when I need a big bear hug?',
];

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function randomInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
  return `LOVE-${suffix}`;
}

function cleanUndefined(value: object): Record<string, any> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function snapshotItems<T>(snapshot: any): T[] {
  const rows = snapshot.docs.map((entry: any) => ({ id: entry.id, ...entry.data() })) as T[];
  return rows.sort((a: any, b: any) => {
    const av = Number(a.timestamp ?? a.updatedAt ?? a.createdAt ?? 0);
    const bv = Number(b.timestamp ?? b.updatedAt ?? b.createdAt ?? 0);
    return bv - av;
  });
}

function makeMember(user: NonNullable<ReturnType<typeof useAuth>['currentUser']>) {
  return {
    id: user.id,
    name: user.name,
    nickname: user.nickname || user.name,
    avatar: user.avatar,
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
  };
}

export const CoupleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, refreshUser } = useAuth();
  const [coupleSpace, setCoupleSpace] = useState<CoupleSpace | null>(null);
  const [partner, setPartner] = useState<CoupleContextType['partner']>(null);
  const [isLoadingCouple, setIsLoadingCouple] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [bucketGoals, setBucketGoals] = useState<BucketGoal[]>([]);
  const [moods, setMoods] = useState<MoodEntry[]>([]);
  const [loveLetters, setLoveLetters] = useState<LoveLetter[]>([]);
  const [coupleSongs, setCoupleSongs] = useState<CoupleSong[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [trips, setTrips] = useState<TravelDestination[]>([]);
  const [dailyAnswers, setDailyAnswers] = useState<{ [userId: string]: string }>({});
  const [hugsCount, setHugsCount] = useState(0);
  const [pinLockCode, setPinLockCode] = useState<string | null>(() => localStorage.getItem('universe_pin_lock'));
  const [isLockedByPin, setIsLockedByPin] = useState(() => Boolean(localStorage.getItem('universe_pin_lock')));
  const [showHugAnimation, setShowHugAnimation] = useState(false);
  const [callingState, setCallingState] = useState<CallingState>({
    active: false,
    incoming: false,
    type: 'video',
    callerName: '',
    duration: 0,
  });

  const todayStr = localDateKey();
  const coupleId = currentUser?.coupleId || null;

  const requireCurrentCouple = useCallback(() => {
    if (!db) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* environment variables.');
    if (!currentUser) throw new Error('Please log in first.');
    if (!currentUser.coupleId) throw new Error('Create or join your couple space first.');
    return { database: db, user: currentUser, coupleId: currentUser.coupleId };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setCoupleSpace(null);
      setPartner(null);
      setMessages([]);
      setPhotos([]);
      setCalendarEvents([]);
      setNotes([]);
      setBucketGoals([]);
      setMoods([]);
      setLoveLetters([]);
      setCoupleSongs([]);
      setQuizQuestions([]);
      setTrips([]);
      setDailyAnswers({});
      setHugsCount(0);
      setIsLoadingCouple(false);
      return;
    }
    if (!coupleId) {
      setCoupleSpace(null);
      setPartner(null);
      setMessages([]);
      setPhotos([]);
      setCalendarEvents([]);
      setNotes([]);
      setBucketGoals([]);
      setMoods([]);
      setLoveLetters([]);
      setCoupleSongs([]);
      setQuizQuestions([]);
      setTrips([]);
      setDailyAnswers({});
      setHugsCount(0);
      setIsLoadingCouple(false);
      return;
    }
    if (!db) {
      setIsLoadingCouple(false);
      return;
    }

    setIsLoadingCouple(true);
    const coupleRef = doc(db, 'couples', coupleId);
    const unsubscribeCouple = onSnapshot(
      coupleRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setCoupleSpace(null);
          setPartner(null);
          setIsLoadingCouple(false);
          return;
        }
        const data = { id: snapshot.id, ...snapshot.data() } as CoupleSpace;
        setCoupleSpace(data);
        const partnerId = data.memberIds.find((memberId) => memberId !== currentUser.id);
        const member = partnerId ? data.members?.[partnerId] : null;
        setPartner(
          member && partnerId
            ? { id: partnerId, name: member.name, nickname: member.nickname, avatar: member.avatar, avatarUrl: member.avatarUrl }
            : null
        );
        setHugsCount(Number((data as any).hugsCount || 0));
        setIsLoadingCouple(false);
      },
      (error) => {
        console.error('Couple listener failed:', error);
        setIsLoadingCouple(false);
      }
    );
    return unsubscribeCouple;
  }, [currentUser?.id, coupleId]);

  useEffect(() => {
    if (!currentUser || !coupleId || !db) return;
    const base = (name: string) => collection(db, 'couples', coupleId, name);
    const report = (label: string) => (error: Error) => console.error(`Firestore ${label} listener failed:`, error);
    const unsubs = [
      onSnapshot(base('messages'), (snap) => setMessages(snapshotItems<ChatMessage>(snap).reverse()), report('messages')),
      onSnapshot(base('photos'), (snap) => setPhotos(snapshotItems<GalleryPhoto>(snap)), report('photos')),
      onSnapshot(base('calendar'), (snap) => setCalendarEvents(snapshotItems<CalendarEvent>(snap)), report('calendar')),
      onSnapshot(base('notes'), (snap) => setNotes(snapshotItems<SharedNote>(snap)), report('notes')),
      onSnapshot(base('bucketGoals'), (snap) => setBucketGoals(snapshotItems<BucketGoal>(snap)), report('bucket goals')),
      onSnapshot(base('moods'), (snap) => setMoods(snapshotItems<MoodEntry>(snap)), report('moods')),
      onSnapshot(base('loveLetters'), (snap) => setLoveLetters(snapshotItems<LoveLetter>(snap)), report('love letters')),
      onSnapshot(base('songs'), (snap) => setCoupleSongs(snapshotItems<CoupleSong>(snap)), report('songs')),
      onSnapshot(base('quizQuestions'), (snap) => setQuizQuestions(snapshotItems<QuizQuestion>(snap)), report('quiz questions')),
      onSnapshot(base('trips'), (snap) => setTrips(snapshotItems<TravelDestination>(snap)), report('trips')),
      onSnapshot(doc(db, 'couples', coupleId, 'dailyAnswers', todayStr), (snap) => {
        setDailyAnswers(snap.exists() ? (snap.data().answers || {}) : {});
      }, report('daily answers')),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [currentUser?.id, coupleId, todayStr]);

  const refreshCouple = useCallback(async () => {
    if (!currentUser?.coupleId) {
      setCoupleSpace(null);
      setPartner(null);
      setIsLoadingCouple(false);
      return;
    }
    if (!db) throw new Error('Firebase is not configured.');
    const snapshot = await getDoc(doc(db, 'couples', currentUser.coupleId));
    if (!snapshot.exists()) {
      setCoupleSpace(null);
      setPartner(null);
      return;
    }
    const data = { id: snapshot.id, ...snapshot.data() } as CoupleSpace;
    setCoupleSpace(data);
    const partnerId = data.memberIds.find((memberId) => memberId !== currentUser.id);
    const member = partnerId ? data.members?.[partnerId] : null;
    setPartner(member && partnerId ? { id: partnerId, ...member } : null);
  }, [currentUser]);

  const createCoupleSpace = async (): Promise<{ success: boolean; couple?: CoupleSpace; error?: string }> => {
    try {
      const { database, user } = requireCurrentCoupleForCreate();
      const userRef = doc(database, 'users', user.id);
      const userSnapshot = await getDoc(userRef);
      if (!userSnapshot.exists()) throw new Error('Your user profile is missing. Please log out and register again.');
      if (userSnapshot.data().coupleId) throw new Error('Your account is already linked to a couple space.');

      // The code has 40 bits of randomness. A collision is extraordinarily unlikely;
      // Firestore Rules reject a write if a code is already claimed by another document.
      const inviteCode = randomInviteCode();
      const inviteRef = doc(database, 'invitations', inviteCode);
      const coupleRef = doc(collection(database, 'couples'));
      const newCouple = {
        id: coupleRef.id,
        ownerId: user.id,
        inviteCode,
        memberIds: [user.id],
        members: { [user.id]: makeMember(user) },
        setupCompleted: false,
        createdAt: new Date().toISOString(),
        hugsCount: 0,
      };
      const batch = writeBatch(database);
      batch.update(userRef, { coupleId: coupleRef.id });
      batch.set(coupleRef, newCouple);
      batch.set(inviteRef, {
        code: inviteCode,
        coupleId: coupleRef.id,
        createdBy: user.id,
        status: 'active',
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
        createdAt: new Date().toISOString(),
      });
      await batch.commit();
      await refreshUser();
      await refreshCouple();
      sounds.playCelebration();
      return { success: true, couple: newCouple as CoupleSpace };
    } catch (error) {
      console.error('Create couple space failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Could not create the couple space.' };
    }
  };

  const requireCurrentCoupleForCreate = () => {
    if (!db) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* environment variables.');
    if (!currentUser) throw new Error('Please log in first.');
    return { database: db, user: currentUser };
  };

  const joinCoupleSpace = async (inviteCode: string): Promise<{ success: boolean; couple?: CoupleSpace; error?: string }> => {
    try {
      if (!db || !currentUser) throw new Error('Please log in first.');
      if (currentUser.coupleId) throw new Error('This account is already linked to a couple space.');
      const code = inviteCode.trim().toUpperCase();
      if (!/^LOVE-[A-HJ-NP-Z2-9]{8}$/.test(code)) throw new Error('That invitation code does not look valid. Check the code and try again.');

      const inviteRef = doc(db, 'invitations', code);
      const inviteData = await runTransaction(db, async (transaction) => {
        const inviteSnap = await transaction.get(inviteRef);
        if (!inviteSnap.exists()) throw new Error('Invitation not found. Ask your partner to generate a new code.');
        const invite = inviteSnap.data();
        if (invite.status !== 'active') throw new Error('This invitation has already been used.');
        if (!(invite.expiresAt instanceof Timestamp) || invite.expiresAt.toMillis() <= Date.now()) {
          throw new Error('This invitation has expired. Ask your partner for a new code.');
        }
        if (invite.createdBy === currentUser.id) throw new Error('You cannot join your own invitation. Use your partner’s account.');

        const coupleRef = doc(db, 'couples', invite.coupleId);
        const userRef = doc(db, 'users', currentUser.id);
        const [coupleSnap, userSnap] = await Promise.all([
          transaction.get(coupleRef),
          transaction.get(userRef),
        ]);
        if (!coupleSnap.exists()) throw new Error('The couple space no longer exists.');
        if (!userSnap.exists()) throw new Error('Your user profile is missing. Please log in again.');
        const couple = coupleSnap.data() as any;
        const profile = userSnap.data() as any;
        if (profile.coupleId) throw new Error('This account is already linked to another couple space.');
        if (!Array.isArray(couple.memberIds) || couple.memberIds.length !== 1) {
          throw new Error('This couple space is already full. Only two people can join.');
        }

        const updatedMembers = { ...(couple.members || {}), [currentUser.id]: makeMember(currentUser) };
        transaction.update(coupleRef, {
          memberIds: [...couple.memberIds, currentUser.id],
          members: updatedMembers,
          updatedAt: new Date().toISOString(),
        });
        transaction.update(userRef, { coupleId: invite.coupleId });
        transaction.update(inviteRef, {
          status: 'claimed',
          claimedBy: currentUser.id,
          claimedAt: new Date().toISOString(),
        });
        return { ...couple, id: coupleSnap.id, memberIds: [...couple.memberIds, currentUser.id], members: updatedMembers };
      });

      await refreshUser();
      await refreshCouple();
      sounds.playCelebration();
      return { success: true, couple: inviteData as CoupleSpace };
    } catch (error) {
      console.error('Join couple space failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Could not join this couple space.' };
    }
  };

  const completeSetup = async (setupData: {
    firstMeetingDate: string;
    relationshipStartDate: string;
    specialDates?: SpecialDates;
    myNickname?: string;
    partnerNickname?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const { database, user, coupleId: activeCoupleId } = requireCurrentCouple();
      const coupleRef = doc(database, 'couples', activeCoupleId);
      const updates: Record<string, unknown> = {
        firstMeetingDate: setupData.firstMeetingDate,
        relationshipStartDate: setupData.relationshipStartDate,
        specialDates: setupData.specialDates || {},
        setupCompleted: true,
        updatedAt: new Date().toISOString(),
      };
      if (setupData.myNickname?.trim()) updates[`members.${user.id}.nickname`] = setupData.myNickname.trim();
      if (setupData.partnerNickname?.trim() && partner?.id) {
        updates[`members.${partner.id}.nickname`] = setupData.partnerNickname.trim();
      }
      await updateDoc(coupleRef, updates);
      await refreshCouple();
      sounds.playCelebration();
      return { success: true };
    } catch (error) {
      console.error('Relationship setup failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Could not save your relationship dates.' };
    }
  };

  const updateRelationshipDates = async (dates: {
    relationshipStartDate?: string;
    firstMeetingDate?: string;
    specialDates?: SpecialDates;
  }) => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    await updateDoc(doc(database, 'couples', activeCoupleId), cleanUndefined({ ...dates, updatedAt: new Date().toISOString() }));
    sounds.playCelebration();
  };

  const sendMessage = async (msg: {
    text: string;
    type?: 'text' | 'image' | 'voice' | 'sticker' | 'love_note';
    mediaUrl?: string;
    stickerId?: string;
    voiceDuration?: number;
    loveNoteSubject?: string;
    replyToId?: string;
    replySnippet?: string;
    ciphertext?: string;
    iv?: string;
    isEncrypted?: boolean;
  }) => {
    const { database, user, coupleId: activeCoupleId } = requireCurrentCouple();
    const messageRef = doc(collection(database, 'couples', activeCoupleId, 'messages'));
    await setDoc(messageRef, {
      id: messageRef.id,
      coupleId: activeCoupleId,
      senderId: user.id,
      senderName: user.name,
      text: msg.text,
      type: msg.type || 'text',
      ...(msg.mediaUrl ? { mediaUrl: msg.mediaUrl } : {}),
      ...(msg.stickerId ? { stickerId: msg.stickerId } : {}),
      ...(msg.voiceDuration ? { voiceDuration: msg.voiceDuration } : {}),
      ...(msg.loveNoteSubject ? { loveNoteSubject: msg.loveNoteSubject } : {}),
      ...(msg.replyToId ? { replyToId: msg.replyToId } : {}),
      ...(msg.replySnippet ? { replySnippet: msg.replySnippet } : {}),
      timestamp: Date.now(),
      isEncrypted: false,
    });
    sounds.playMessagePop();
  };

  const deleteMessage = async (id: string) => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    await deleteDoc(doc(database, 'couples', activeCoupleId, 'messages', id));
  };

  const addPhoto = async (photo: { url: string; caption: string; album: string; dateTaken: string }) => {
    const { database, user, coupleId: activeCoupleId } = requireCurrentCouple();
    const photoRef = doc(collection(database, 'couples', activeCoupleId, 'photos'));
    await setDoc(photoRef, {
      id: photoRef.id,
      coupleId: activeCoupleId,
      ...photo,
      uploadedByUserId: user.id,
      uploadedByName: user.name,
      timestamp: Date.now(),
      isFavorite: false,
      comments: [],
    });
    sounds.playMessagePop();
  };

  const deletePhoto = async (id: string) => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    await deleteDoc(doc(database, 'couples', activeCoupleId, 'photos', id));
  };

  const albums = useMemo(() => [
    { id: 'best_moments', title: 'Best Moments 💖', count: photos.filter((p) => p.album === 'best_moments').length },
    { id: 'dates_trips', title: 'Dates & Trips ✈️', count: photos.filter((p) => p.album === 'dates_trips').length },
    { id: 'everyday_love', title: 'Everyday Love ☕', count: photos.filter((p) => p.album === 'everyday_love').length },
    { id: 'funny_sweet', title: 'Silly & Sweet 🐻', count: photos.filter((p) => p.album === 'funny_sweet').length },
  ], [photos]);

  const toggleFavoritePhoto = async (id: string) => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    const photo = photos.find((item) => item.id === id);
    if (!photo) return;
    await updateDoc(doc(database, 'couples', activeCoupleId, 'photos', id), { isFavorite: !photo.isFavorite });
    sounds.playHeartReaction();
  };

  const addPhotoComment = async (photoId: string, text: string) => {
    const { database, user, coupleId: activeCoupleId } = requireCurrentCouple();
    await updateDoc(doc(database, 'couples', activeCoupleId, 'photos', photoId), {
      comments: arrayUnion({ id: crypto.randomUUID(), authorId: user.id, authorName: user.name, text, timestamp: Date.now() }),
    });
    sounds.playMessagePop();
  };

  const addCalendarEvent = async (event: {
    title: string; date: string; time?: string; description: string; category: any;
    location?: string; isDayToRemember?: boolean;
  }) => {
    const { database, user, coupleId: activeCoupleId } = requireCurrentCouple();
    const eventRef = doc(collection(database, 'couples', activeCoupleId, 'calendar'));
    await setDoc(eventRef, {
      id: eventRef.id, coupleId: activeCoupleId, ...cleanUndefined(event),
      createdByUserId: user.id, createdByName: user.name, timestamp: Date.now(),
    });
    sounds.playMessagePop();
  };

  const deleteCalendarEvent = async (id: string) => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    await deleteDoc(doc(database, 'couples', activeCoupleId, 'calendar', id));
  };

  const addNote = async (note: {
    title: string; content: string; category: any; priority: any; assignedTo: string;
    checklist?: any[]; pinned?: boolean;
  }) => {
    const { database, user, coupleId: activeCoupleId } = requireCurrentCouple();
    const noteRef = doc(collection(database, 'couples', activeCoupleId, 'notes'));
    const now = Date.now();
    await setDoc(noteRef, {
      id: noteRef.id, coupleId: activeCoupleId, ...cleanUndefined(note),
      pinned: Boolean(note.pinned), createdByUserId: user.id, createdAt: now, updatedAt: now,
    });
    sounds.playMessagePop();
  };

  const updateNote = async (id: string, updates: Partial<SharedNote>) => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    const { id: _ignoredId, coupleId: _ignoredCouple, ...safeUpdates } = updates;
    await updateDoc(doc(database, 'couples', activeCoupleId, 'notes', id), cleanUndefined({ ...safeUpdates, updatedAt: Date.now() }));
  };

  const deleteNote = async (id: string) => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    await deleteDoc(doc(database, 'couples', activeCoupleId, 'notes', id));
  };

  const toggleChecklistItem = async (noteId: string, itemId: string) => {
    const note = notes.find((item) => item.id === noteId);
    if (!note?.checklist) return;
    await updateNote(noteId, {
      checklist: note.checklist.map((item) => item.id === itemId ? { ...item, completed: !item.completed } : item),
    });
  };

  const addBucketGoal = async (goal: { title: string; category: string }) => {
    const { database, user, coupleId: activeCoupleId } = requireCurrentCouple();
    const goalRef = doc(collection(database, 'couples', activeCoupleId, 'bucketGoals'));
    await setDoc(goalRef, {
      id: goalRef.id, coupleId: activeCoupleId, ...goal,
      completed: false, addedByUserId: user.id, addedByName: user.name, createdAt: Date.now(),
    });
    sounds.playMessagePop();
  };

  const toggleBucketGoal = async (id: string) => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    const goal = bucketGoals.find((item) => item.id === id);
    if (!goal) return;
    const completed = !goal.completed;
    await updateDoc(doc(database, 'couples', activeCoupleId, 'bucketGoals', id), {
      completed, completedAt: completed ? Date.now() : null,
    });
    if (completed) sounds.playCelebration();
  };

  const deleteBucketGoal = async (id: string) => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    await deleteDoc(doc(database, 'couples', activeCoupleId, 'bucketGoals', id));
  };

  const setTodayMood = async (mood: MoodType, note?: string) => {
    const { database, user, coupleId: activeCoupleId } = requireCurrentCouple();
    const moodId = `${user.id}_${todayStr}`;
    await setDoc(doc(database, 'couples', activeCoupleId, 'moods', moodId), {
      id: moodId, coupleId: activeCoupleId, userId: user.id, userName: user.name,
      mood, ...(note ? { note } : {}), date: todayStr, timestamp: Date.now(),
    });
    sounds.playHeartReaction();
  };

  const todayMoods = useMemo(() => ({
    myMood: moods.find((m) => m.userId === currentUser?.id && m.date === todayStr),
    partnerMood: moods.find((m) => m.userId === partner?.id && m.date === todayStr),
  }), [moods, currentUser?.id, partner?.id, todayStr]);

  const sendVirtualHug = async () => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    await updateDoc(doc(database, 'couples', activeCoupleId), { hugsCount: increment(1), updatedAt: new Date().toISOString() });
    sounds.playHugSound();
    setShowHugAnimation(true);
  };

  const closeHugAnimation = () => setShowHugAnimation(false);

  const addLoveLetter = async (letter: { title: string; content: string; unlockDate: string }) => {
    const { database, user, coupleId: activeCoupleId } = requireCurrentCouple();
    const ref = doc(collection(database, 'couples', activeCoupleId, 'loveLetters'));
    await setDoc(ref, {
      id: ref.id, coupleId: activeCoupleId, senderId: user.id, senderName: user.name,
      ...letter, isOpened: false, createdAt: Date.now(),
    });
    sounds.playMessagePop();
  };

  const openLoveLetter = async (id: string) => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    const letter = loveLetters.find((item) => item.id === id);
    if (!letter) return;
    if (letter.unlockDate > todayStr) throw new Error('This love letter is still sealed until its unlock date.');
    await updateDoc(doc(database, 'couples', activeCoupleId, 'loveLetters', id), { isOpened: true });
    sounds.playCelebration();
  };

  const addCoupleSong = async (song: { title: string; artist: string; link?: string; platform: any; memoryNote?: string }) => {
    const { database, user, coupleId: activeCoupleId } = requireCurrentCouple();
    const ref = doc(collection(database, 'couples', activeCoupleId, 'songs'));
    await setDoc(ref, {
      id: ref.id, coupleId: activeCoupleId, ...cleanUndefined(song),
      addedByUserId: user.id, addedByName: user.name, createdAt: Date.now(),
    });
    sounds.playMessagePop();
  };

  const deleteCoupleSong = async (id: string) => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    await deleteDoc(doc(database, 'couples', activeCoupleId, 'songs', id));
  };

  const addTrip = async (trip: {
    title: string; destination: string; startDate: string; endDate: string;
    budget?: { estimated: number; spent: number }; itinerary?: any[]; packingList?: any[]; hotelDetails?: string;
  }) => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    const ref = doc(collection(database, 'couples', activeCoupleId, 'trips'));
    await setDoc(ref, {
      id: ref.id, coupleId: activeCoupleId, ...cleanUndefined(trip),
      visited: false, itinerary: trip.itinerary || [], packingList: trip.packingList || [], createdAt: Date.now(),
    });
    sounds.playMessagePop();
  };

  const toggleTripVisited = async (id: string) => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    const trip = trips.find((item) => item.id === id);
    if (!trip) return;
    await updateDoc(doc(database, 'couples', activeCoupleId, 'trips', id), { visited: !trip.visited });
  };

  const togglePackingItem = async (tripId: string, itemId: string) => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    const trip = trips.find((item) => item.id === tripId);
    if (!trip?.packingList) return;
    const packingList = trip.packingList.map((item) => item.id === itemId ? { ...item, checked: !item.checked } : item);
    await updateDoc(doc(database, 'couples', activeCoupleId, 'trips', tripId), { packingList });
  };

  const deleteTrip = async (id: string) => {
    const { database, coupleId: activeCoupleId } = requireCurrentCouple();
    await deleteDoc(doc(database, 'couples', activeCoupleId, 'trips', id));
  };

  const todayIndex = Math.floor(Date.now() / 86400000) % DAILY_QUESTIONS_POOL.length;
  const currentDailyQuestion: DailyQuestion = {
    id: `dq_${todayStr}`,
    question: DAILY_QUESTIONS_POOL[todayIndex],
    date: todayStr,
    answers: dailyAnswers,
  };

  const answerDailyQuestion = async (answer: string) => {
    const { database, user, coupleId: activeCoupleId } = requireCurrentCouple();
    const answerRef = doc(database, 'couples', activeCoupleId, 'dailyAnswers', todayStr);
    await setDoc(answerRef, { id: todayStr, date: todayStr, answers: { [user.id]: answer } }, { merge: true });
    sounds.playHeartReaction();
  };

  const answerQuizQuestion = async (questionId: string, answerIndex: number) => {
    const { database, user, coupleId: activeCoupleId } = requireCurrentCouple();
    await updateDoc(doc(database, 'couples', activeCoupleId, 'quizQuestions', questionId), {
      [`answers.${user.id}`]: answerIndex,
    });
    sounds.playCelebration();
  };

  const startCall = useCallback((type: 'voice' | 'video') => {
    setCallingState({ active: true, incoming: false, type, callerName: currentUser?.name || 'Me', duration: 0 });
    sounds.playMessagePop();
  }, [currentUser]);

  const acceptCall = useCallback(() => setCallingState((previous) => ({ ...previous, incoming: false })), []);
  const rejectCall = useCallback(() => setCallingState({ active: false, incoming: false, type: 'voice', callerName: '', duration: 0 }), []);
  const endCall = useCallback(() => setCallingState({ active: false, incoming: false, type: 'voice', callerName: '', duration: 0 }), []);

  useEffect(() => {
    if (!callingState.active || callingState.incoming) return;
    const timer = window.setInterval(() => setCallingState((previous) => ({ ...previous, duration: previous.duration + 1 })), 1000);
    return () => window.clearInterval(timer);
  }, [callingState.active, callingState.incoming]);

  const setPin = async (pin: string | null) => {
    // This is a convenience screen lock for this browser, not account authentication.
    if (pin) {
      localStorage.setItem('universe_pin_lock', pin);
      setPinLockCode(pin);
      setIsLockedByPin(true);
    } else {
      localStorage.removeItem('universe_pin_lock');
      setPinLockCode(null);
      setIsLockedByPin(false);
    }
  };

  const unlockWithPin = async (enteredPin: string): Promise<boolean> => {
    if (!pinLockCode || enteredPin === pinLockCode) {
      setIsLockedByPin(false);
      return true;
    }
    return false;
  };

  const resetAllCoupleData = async () => {
    // Destructive unlinking is intentionally disabled until a two-party confirmation flow exists.
    window.alert('For safety, unpairing and deleting the shared space are not enabled yet. Your memories have not been changed.');
  };

  const isPaired = Boolean(coupleSpace && coupleSpace.memberIds.length === 2);
  const setupCompleted = Boolean(coupleSpace && coupleSpace.setupCompleted && coupleSpace.relationshipStartDate);

  return (
    <CoupleContext.Provider
      value={{
        coupleSpace, partner, isPaired, setupCompleted, isLoadingCouple, refreshCouple,
        createCoupleSpace, joinCoupleSpace, completeSetup, updateRelationshipDates,
        messages, sendMessage, deleteMessage,
        photos, albums, addPhoto, deletePhoto, toggleFavoritePhoto, addPhotoComment,
        calendarEvents, addCalendarEvent, deleteCalendarEvent,
        notes, addNote, updateNote, deleteNote, toggleChecklistItem,
        bucketGoals, addBucketGoal, toggleBucketGoal, deleteBucketGoal,
        trips, addTrip, toggleTripVisited, togglePackingItem, deleteTrip,
        moods, todayMoods, setTodayMood, loveLetters, addLoveLetter, openLoveLetter,
        coupleSongs, addCoupleSong, deleteCoupleSong,
        currentDailyQuestion, answerDailyQuestion, quizQuestions, answerQuizQuestion,
        hugsCount, sendVirtualHug, showHugAnimation, closeHugAnimation,
        callingState, startCall, acceptCall, rejectCall, endCall,
        isLockedByPin, setPin, unlockWithPin, resetAllCoupleData,
      }}
    >
      {children}
    </CoupleContext.Provider>
  );
};

export const useCouple = () => {
  const context = useContext(CoupleContext);
  if (!context) throw new Error('useCouple must be used within a CoupleProvider');
  return context;
};
