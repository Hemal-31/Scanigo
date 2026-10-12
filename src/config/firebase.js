import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth"; 
import { getFirestore } from "firebase/firestore";

// Firebase web application configuration
const firebaseConfig = {
  apiKey: "AIzaSyC5YU4Po73nP7X2XNX6UXYK2nVInbvD5oA",
  authDomain: "scanigo-a9302.firebaseapp.com",
  projectId: "scanigo-a9302",
  storageBucket: "scanigo-a9302.firebasestorage.app",
  messagingSenderId: "1013784366366",
  appId: "1:1013784366366:web:9d8023804d2f05e22a8d0f",
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Firebase Services
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

export default app;
