'use client';

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// ----------------------
// Firebase 설정
// ----------------------
const firebaseConfig = {
  apiKey: 'AIzaSyD1xPZLySlqSJOfsdgfqY-ZXuu4ZRaDceM',
  authDomain: 'promise-room.firebaseapp.com',
  projectId: 'promise-room',
  storageBucket: 'promise-room.firebasestorage.app',
  messagingSenderId: '790788861101',
  appId: '1:790788861101:web:e6d43c8bd86450f1cfaa24',
  measurementId: 'G-44K33KRD3H',
};

// ----------------------
// Firebase 앱 초기화 (중복 방지)
// ----------------------
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// ----------------------
// Export: 전역 공용 인스턴스
// ----------------------
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
