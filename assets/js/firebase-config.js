import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Your web app's Firebase configuration, now with your keys embedded.
const firebaseConfig = {
  apiKey: "AIzaSyD76fBxjFkAj5lV244jPz1hXCBme207bmg",
  authDomain: "onlineexamms.firebaseapp.com",
  projectId: "onlineexamms",
  storageBucket: "onlineexamms.firebasestorage.app",
  messagingSenderId: "695976180700",
  appId: "1:695976180700:web:8de2d4dea235e48b66ad19",
  measurementId: "G-EJHWK80CCJ"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the services you'll need in other files
export const auth = getAuth(app);
export const db = getFirestore(app);

