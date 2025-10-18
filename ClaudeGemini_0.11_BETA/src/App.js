import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Calendar, MapPin, QrCode, Users, Send, CheckCircle, XCircle, Trash2, Search, PlusCircle, Edit, User, LogOut } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  query, 
  where, 
  getDocs, 
  deleteDoc,
  onSnapshot,
  runTransaction 
} from 'firebase/firestore';

// --- FIREBASE CONFIGURATION & INITIALIZATION ---
let app;
let auth;
let db;
let appId;
let firebaseConfig;
let initError = null; // New state to track initialization errors

try {
    firebaseConfig = typeof window.__firebase_config !== 'undefined' 
      ? JSON.parse(window.__firebase_config) 
      : {};

    // Check if essential config is present before attempting init
    if (!firebaseConfig.apiKey) {
        throw new Error("Firebase API key is missing.");
    }
    
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';

} catch (e) {
    // If initialization fails here, the outer variables remain undefined.
    initError = "Failed to initialize Firebase. Check console for config errors.";
    console.error("Critical Firebase initialization error:", e.message);
}

// Firestore Paths (using recommended artifact/appId structure)
const USERS_COLLECTION = `artifacts/${appId}/user_profiles`;
const EVENTS_COLLECTION_PATH = `artifacts/${appId}/events_list`;
const TICKETS_COLLECTION_BASE = `artifacts/${appId}/tickets`;

// Helper functions for collection references
const getPublicEventsPath = () => collection(db, EVENTS_COLLECTION_PATH);
const getUserProfilesPath = () => collection(db, USERS_COLLECTION);
const getUserTicketsPath = (uid) => collection(db, `${TICKETS_COLLECTION_BASE}/${uid}/user_tickets`);


// Helper functions (Simplified now that Firestore handles unique IDs)
const generateAlternateId = () => Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
const generateQRCode = () => Math.random().toString(36).substring(2, 12).toUpperCase();

// --- FIREBASE SERVICE (API) ---
// Only access Firebase variables if they are defined
const firebaseApi = {
    // AUTHENTICATION
    async register(name, email, password) {
        if (!auth || !db) throw new Error("Firebase not initialized.");
        // 1. Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const defaultRole = 'buyer';

        // 2. Create profile document in Firestore (for role/discount/name)
        await setDoc(doc(db, USERS_COLLECTION, user.uid), {
            name: name,
            username: email.split('@')[0], // Use part of email as username for simplicity
            email: email,
            role: defaultRole,
            discount: 0.10, // Default 10% discount for new buyers
            hasAccommodations: false,
            facultyRestricted: false,
            createdAt: new Date().toISOString()
        });
        return { message: 'Registration successful. Please log in.' };
    },

    async login(email, password) {
        if (!auth || !db) throw new Error("Firebase not initialized.");
        // Firebase Auth handles sign-in with email/password
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        // Fetch user role and profile data from Firestore
        const docRef = doc(db, USERS_COLLECTION, uid);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            // Log out user if profile doesn't exist (corrupt state)
            await signOut(auth);
            throw new Error("User profile not found. Contact admin.");
        }

        const data = docSnap.data();
        return {
            ...data,
            id: uid,
            email: userCredential.user.email,
        };
    },

    async logout() {
        if (!auth) return;
        await signOut(auth);
    },

    // EVENT CRUD (ADMIN)
    async createEvent(eventData, defaultSeats) {
        if (!db) throw new Error("Firebase not initialized.");
        const newEventRef = doc(getPublicEventsPath());
        const eventId = newEventRef.id;

        // Use a transaction to ensure atomicity
        await runTransaction(db, async (transaction) => {
            // 1. Create the base event document
            transaction.set(newEventRef, {
                ...eventData,
                id: eventId,
                booked_seats: 0,
                created_at: new Date().toISOString(),
                // Simplified: Store auditorium/seats directly on the event document
                auditoriums: [{ id: 'aud-main', name: `${eventData.venue} Main Area`, seats: defaultSeats }]
            });
        });
        return { message: `Event "${eventData.name}" created successfully.` };
    },

    async deleteEvent(eventId) {
        if (!db) throw new Error("Firebase not initialized.");
        const eventRef = doc(getPublicEventsPath(), eventId);
        await deleteDoc(eventRef);
        return { message: 'Event deleted successfully.' };
    },

    // USER DATA
    async getUsers() {
        if (!db) throw new Error("Firebase not initialized.");
        const snapshot = await getDocs(getUserProfilesPath());
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    
    // TICKET ACTIONS
    async bookTicket(userId, eventId, seatId, finalPrice, originalPrice, discount) {
        if (!db) throw new Error("Firebase not initialized.");
        const userTicketRef = doc(getUserTicketsPath(userId), seatId);
        const eventRef = doc(getPublicEventsPath(), eventId);

        await runTransaction(db, async (transaction) => {
            const eventDoc = await transaction.get(eventRef);
            if (!eventDoc.exists()) {
                throw new Error("Event not found.");
            }
            const eventData = eventDoc.data();
            
            // Find the seat and check availability
            let auditoriumIndex = -1;
            let seatIndex = -1;

            for (let i = 0; i < eventData.auditoriums.length; i++) {
                seatIndex = eventData.auditoriums[i].seats.findIndex(s => s.id === seatId);
                if (seatIndex !== -1) {
                    auditoriumIndex = i;
                    break;
                }
            }
            
            if (seatIndex === -1 || eventData.auditoriums[auditoriumIndex].seats[seatIndex].isBooked) {
                throw new Error("Seat is already booked or does not exist.");
            }
            
            // 1. Mark seat as booked in the event document
            eventData.auditoriums[auditoriumIndex].seats[seatIndex].isBooked = true;
            eventData.booked_seats = (eventData.booked_seats || 0) + 1;
            transaction.update(eventRef, { 
                auditoriums: eventData.auditoriums, 
                booked_seats: eventData.booked_seats 
            });

            // 2. Create the ticket document for the user
            const seat = eventData.auditoriums[auditoriumIndex].seats[seatIndex];
            transaction.set(userTicketRef, {
                id: seatId, // Use seatId as ticket ID for simplicity
                userId: userId,
                eventId: eventId,
                eventName: eventData.name,
                venue: eventData.venue,
                date: eventData.date,
                time: eventData.time,
                seatId: seatId,
                row: seat.row,
                column: seat.column,
                originalPrice: originalPrice,
                finalPrice: finalPrice,
                qrCode: generateQRCode(),
                alternateId: generateAlternateId(),
                isFacultyOnly: seat.isFacultyOnly,
                status: 'valid',
                created_at: new Date().toISOString()
            });
        });
        return { message: 'Ticket booked successfully!' };
    },
    
    // NOTE: Stubbed functions for simulated success/failure
    async returnTicket(ticketId, userId) {
        alert("Return/Refund simulated: Success (Requires full Firestore implementation).");
        return { message: 'Return simulated.' };
    },
    async transferTicket(ticketId, userId, targetEmail) {
        alert(`Transfer simulated to ${targetEmail}: Success (Requires full Firestore implementation).`);
        return { message: 'Transfer simulated.' };
    }
};


// --- CUSTOM LOGO SVG COMPONENT ---
/**
 * Renders the custom Dragon Logo, dynamically changing fill color based on theme.
 * Uses the user-provided SVG structure.
 * @param {number} size - Size in pixels.
 * @param {'light'|'dark'} theme - 'light' for dark background (white text), 'dark' for white background (maroon text).
 */
const BoxOfficeDragonLogo = ({ size = 28, theme = 'dark' }) => {
  // Determine the color class based on where the logo is placed (light text for dark header, dark text for light body)
  const textColorClass = theme === 'light' ? 'text-white' : 'text-red-900'; 
  const svgSize = size * 1.5; // Scale SVG down slightly to fit icon area

  const height = size;
  const width = height * (326.25 / 30.000001); // Calculate width to maintain aspect ratio

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      width={width}
      height={height}
      viewBox="0 0 326.25 30.000001"
      preserveAspectRatio="xMidYMid meet"
      className={textColorClass}
      fill="currentColor" // Inherit color
      stroke="currentColor" // Inherit color
    >
      <defs>
        <clipPath id="b7f09c9b28">
          <path
            d="M 0.898438 0.148438 L 51.871094 0.148438 L 51.871094 28.316406 L 0.898438 28.316406 Z M 0.898438 0.148438 "
            clipRule="nonzero"
          />
        </clipPath>
        <clipPath id="c089218b77">
          <path
            d="M 55 0 L 316.625 0 L 316.625 28 L 55 28 Z M 55 0 "
            clipRule="nonzero"
          />
        </clipPath>
        <clipPath id="4c5da604ec">
          <rect x={0} width={262} y={0} height={28} />
        </clipPath>
        <clipPath id="2b347b9fcb">
          <rect x={0} width={317} y={0} height={30} />
        </clipPath>
      </defs>
      <g> {/* Outer G tag */}
        <g transform="matrix(1, 0, 0, 1, 4, 0.000000000000005692)">
          <g clipPath="url(#2b347b9fcb)">
            <g clipPath="url(#b7f09c9b28)">
              <path
                fill="currentColor"
                d="M 49.105469 28.871094 C 49.105469 28.871094 49.105469 28.882812 49.105469 28.882812 L 3.769531 28.882812 C 3.769531 28.882812 3.769531 28.871094 3.769531 28.871094 C 3.769531 26.691406 2.015625 24.917969 -0.164062 24.894531 L -0.0585938 24.894531 C 0.167969 24.894531 0.359375 24.714844 0.359375 24.476562 C 0.359375 24.253906 0.175781 24.070312 -0.046875 24.0625 C 0.175781 24.050781 0.359375 23.867188 0.359375 23.644531 C 0.359375 23.421875 0.175781 23.238281 -0.046875 23.226562 C 0.175781 23.21875 0.359375 23.035156 0.359375 22.8125 C 0.359375 22.585938 0.175781 22.40625 -0.046875 22.394531 C 0.175781 22.382812 0.359375 22.203125 0.359375 21.976562 C 0.359375 21.753906 0.175781 21.570312 -0.046875 21.558594 C 0.175781 21.550781 0.359375 21.367188 0.359375 21.144531 C 0.359375 20.917969 0.175781 20.738281 -0.046875 20.726562 C 0.175781 20.714844 0.359375 20.535156 0.359375 20.308594 C 0.359375 20.085938 0.175781 19.902344 -0.046875 19.890625 C 0.175781 19.882812 0.359375 19.699219 0.359375 19.476562 C 0.359375 19.25 0.175781 19.070312 -0.046875 19.058594 C 0.175781 19.046875 0.359375 18.867188 0.359375 18.640625 C 0.359375 18.417969 0.175781 18.234375 -0.046875 18.226562 C 0.175781 18.214844 0.359375 18.03125 0.359375 17.808594 C 0.359375 17.582031 0.175781 17.402344 -0.046875 17.390625 C 0.175781 17.378906 0.359375 17.199219 0.359375 16.972656 C 0.359375 16.75 0.175781 16.566406 -0.046875 16.558594 C 0.175781 16.546875 0.359375 16.363281 0.359375 16.140625 C 0.359375 15.914062 0.175781 15.734375 -0.046875 15.722656 C 0.175781 15.710938 0.359375 15.53125 0.359375 15.304688 C 0.359375 15.082031 0.175781 14.898438 -0.046875 14.890625 C 0.175781 14.878906 0.359375 14.695312 0.359375 14.472656 C 0.359375 14.25 0.175781 14.066406 -0.046875 14.054688 C 0.175781 14.046875 0.359375 13.863281 0.359375 13.640625 C 0.359375 13.414062 0.175781 13.234375 -0.046875 13.222656 C 0.175781 13.210938 0.359375 13.03125 0.359375 12.804688 C 0.359375 12.582031 0.175781 12.398438 -0.046875 12.386719 C 0.175781 12.378906 0.359375 12.195312 0.359375 11.972656 C 0.359375 11.746094 0.175781 11.566406 -0.046875 11.554688 C 0.175781 11.542969 0.359375 11.363281 0.359375 11.136719 C 0.359375 10.914062 0.175781 10.730469 -0.046875 10.71875 C 0.175781 10.710938 0.359375 10.527344 0.359375 10.304688 C 0.359375 10.078125 0.175781 9.898438 -0.046875 9.886719 C 0.175781 9.875 0.359375 9.695312 0.359375 9.46875 C 0.359375 9.246094 0.175781 9.171875 -0.046875 9.160156 C 0.175781 9.148438 0.359375 8.96875 0.359375 8.742188 C 0.359375 8.519531 0.175781 8.335938 -0.046875 8.324219 C 0.175781 8.316406 0.359375 8.132812 0.359375 7.910156 C 0.359375 7.683594 0.175781 7.503906 -0.046875 7.492188 C 0.175781 7.480469 0.359375 7.300781 0.359375 7.074219 C 0.359375 6.851562 0.175781 6.667969 -0.046875 6.660156 C 0.175781 6.648438 0.359375 6.464844 0.359375 6.242188 C 0.359375 6.015625 0.175781 5.835938 -0.046875 5.824219 C 0.175781 5.8125 0.359375 5.632812 0.359375 5.40625 C 0.359375 5.183594 0.175781 5 -0.046875 4.992188 C 0.175781 4.980469 0.359375 4.796875 0.359375 4.574219 C 0.359375 4.382812 0.21875 4.210938 0.0390625 4.167969 C 2.121094 4.050781 3.769531 2.316406 3.769531 0.203125 C 3.769531 0.179688 3.769531 0.160156 3.769531 0.148438 L 49.113281 0.148438 C 49.113281 0.167969 49.113281 0.191406 49.113281 0.203125 C 49.113281 2.328125 50.78125 4.0625 52.878906 4.167969 C 52.695312 4.210938 52.558594 4.371094 52.558594 4.574219 C 52.558594 4.796875 52.738281 4.980469 52.964844 4.992188 C 52.738281 5 52.558594 5.183594 52.558594 5.40625 C 52.558594 5.632812 52.738281 5.8125 52.964844 5.824219 C 52.738281 5.835938 52.558594 6.015625 52.558594 6.242188 C 52.558594 6.464844 52.738281 6.648438 52.964844 6.660156 C 52.738281 6.667969 52.558594 6.851562 52.558594 7.074219 C 52.558594 7.300781 52.738281 7.480469 52.964844 7.492188 C 52.738281 7.503906 52.558594 7.691406 52.558594 7.914062 C 52.558594 8.140625 52.738281 8.320312 52.964844 8.332031 C 52.738281 8.34375 52.558594 8.523438 52.558594 8.75 C 52.558594 8.976562 52.738281 9.15625 52.964844 9.167969 C 52.738281 9.179688 52.558594 9.359375 52.558594 9.585938 C 52.558594 9.8125 52.738281 9.992188 52.964844 10.003906 C 52.738281 10.015625 52.558594 10.195312 52.558594 10.421875 C 52.558594 10.648438 52.738281 10.828125 52.964844 10.839844 C 52.738281 10.851562 52.558594 11.03125 52.558594 11.257812 C 52.558594 11.480469 52.738281 11.664062 52.964844 11.671875 C 52.738281 11.683594 52.558594 11.863281 52.558594 12.089844 C 52.558594 12.316406 52.738281 12.496094 52.964844 12.507812 C 52.738281 12.519531 52.558594 12.699219 52.558594 12.925781 C 52.558594 13.152344 52.738281 13.332031 52.964844 13.34375 C 52.738281 13.355469 52.558594 13.535156 52.558594 13.761719 C 52.558594 13.984375 52.738281 14.167969 52.964844 14.175781 C 52.738281 14.1875 52.558594 14.367188 52.558594 14.59375 C 52.558594 14.820312 52.738281 15 52.964844 15.011719 C 52.738281 15.023438 52.558594 15.203125 52.558594 15.429688 C 52.558594 15.652344 52.738281 15.835938 52.964844 15.84375 C 52.738281 15.855469 52.558594 16.035156 52.558594 16.261719 C 52.558594 16.484375 52.738281 16.667969 52.964844 16.675781 C 52.738281 16.6875 52.558594 16.867188 52.558594 17.09375 C 52.558594 17.320312 52.738281 17.5 52.964844 17.511719 C 52.738281 17.523438 52.558594 17.703125 52.558594 17.929688 C 52.558594 18.152344 52.738281 18.335938 52.964844 18.34375 C 52.738281 18.355469 52.558594 18.535156 52.558594 18.761719 C 52.558594 18.984375 52.738281 19.167969 52.964844 19.175781 C 52.738281 19.1875 52.558594 19.367188 52.558594 19.59375 C 52.558594 19.820312 52.738281 20 52.964844 20.011719 C 52.738281 20.023438 52.558594 20.203125 52.558594 20.429688 C 52.558594 20.652344 52.738281 20.835938 52.964844 20.84375 C 52.738281 20.855469 52.558594 21.035156 52.558594 21.261719 C 52.558594 21.484375 52.738281 21.667969 52.964844 21.675781 C 52.738281 21.6875 52.558594 21.867188 52.558594 22.09375 C 52.558594 22.320312 52.738281 22.5 52.964844 22.511719 C 52.738281 22.523438 52.558594 22.703125 52.558594 22.929688 C 52.558594 23.152344 52.738281 23.335938 52.964844 23.34375 C 52.738281 23.355469 52.558594 23.535156 52.558594 23.761719 C 52.558594 23.984375 52.738281 24.167969 52.964844 24.175781 C 52.738281 24.1875 52.558594 24.367188 52.558594 24.59375 C 52.558594 24.820312 52.738281 25.003906 52.972656 25.003906 L 53.046875 25.003906 C 50.867188 24.917969 49.105469 26.691406 49.105469 28.871094 Z M 49.105469 28.871094 "
                fillOpacity={1}
                fillRule="nonzero"
              />
            </g>
            <g clipPath="url(#c089218b77)">
              <g transform="matrix(1, 0, 0, 1, 55, 0.000000000000005692)">
                <g clipPath="url(#4c5da604ec)">
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(0.855743, 22.15073)">
                      <g>
                        <path d="M 1.921875 -15.96875 L 9.328125 -15.96875 C 11.171875 -15.96875 12.5625 -15.492188 13.5 -14.546875 C 14.226562 -13.816406 14.59375 -12.914062 14.59375 -11.84375 L 14.59375 -11.796875 C 14.59375 -11.335938 14.535156 -10.929688 14.421875 -10.578125 C 14.316406 -10.234375 14.164062 -9.921875 13.96875 -9.640625 C 13.78125 -9.359375 13.5625 -9.109375 13.3125 -8.890625 C 13.0625 -8.679688 12.789062 -8.5 12.5 -8.34375 C 13.425781 -8 14.15625 -7.523438 14.6875 -6.921875 C 15.21875 -6.316406 15.484375 -5.484375 15.484375 -4.421875 L 15.484375 -4.375 C 15.484375 -3.644531 15.34375 -3.003906 15.0625 -2.453125 C 14.78125 -1.910156 14.378906 -1.457031 13.859375 -1.09375 C 13.335938 -0.726562 12.707031 -0.453125 11.96875 -0.265625 C 11.226562 -0.0859375 10.410156 0 9.515625 0 L 1.921875 0 Z M 11.109375 -11.25 C 11.109375 -11.78125 10.910156 -12.1875 10.515625 -12.46875 C 10.117188 -12.75 9.550781 -12.890625 8.8125 -12.890625 L 5.34375 -12.890625 L 5.34375 -9.515625 L 8.578125 -9.515625 C 9.347656 -9.515625 9.960938 -9.644531 10.421875 -9.90625 C 10.878906 -10.175781 11.109375 -10.609375 11.109375 -11.203125 Z M 12 -4.859375 C 12 -5.390625 11.789062 -5.8125 11.375 -6.125 C 10.96875 -6.4375 10.3125 -6.59375 9.40625 -6.59375 L 5.34375 -6.59375 L 5.34375 -3.078125 L 9.515625 -3.078125 C 10.285156 -3.078125 10.890625 -3.21875 11.328125 -3.5 C 11.773438 -3.78125 12 -4.21875 12 -4.8125 Z M 12 -4.859375 " />
                      </g>
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(17.313906, 22.15073)">
                      <g>
                        <path d="M 9.671875 0.28125 C 8.441406 0.28125 7.304688 0.0625 6.265625 -0.375 C 5.234375 -0.8125 4.34375 -1.394531 3.59375 -2.125 C 2.84375 -2.863281 2.253906 -3.734375 1.828125 -4.734375 C 1.410156 -5.734375 1.203125 -6.800781 1.203125 -7.9375 L 1.203125 -7.984375 C 1.203125 -9.128906 1.414062 -10.195312 1.84375 -11.1875 C 2.269531 -12.1875 2.859375 -13.0625 3.609375 -13.8125 C 4.367188 -14.5625 5.269531 -15.15625 6.3125 -15.59375 C 7.351562 -16.03125 8.488281 -16.25 9.71875 -16.25 C 10.945312 -16.25 12.078125 -16.03125 13.109375 -15.59375 C 14.148438 -15.15625 15.046875 -14.566406 15.796875 -13.828125 C 16.546875 -13.097656 17.128906 -12.234375 17.546875 -11.234375 C 17.972656 -10.234375 18.1875 -9.164062 18.1875 -8.03125 L 18.1875 -7.984375 C 18.1875 -6.847656 17.972656 -5.78125 17.546875 -4.78125 C 17.117188 -3.78125 16.523438 -2.90625 15.765625 -2.15625 C 15.015625 -1.40625 14.117188 -0.8125 13.078125 -0.375 C 12.035156 0.0625 10.898438 0.28125 9.671875 0.28125 Z M 9.71875 -2.96875 C 10.414062 -2.96875 11.0625 -3.09375 11.65625 -3.34375 C 12.25 -3.601562 12.753906 -3.960938 13.171875 -4.421875 C 13.585938 -4.878906 13.914062 -5.40625 14.15625 -6 C 14.394531 -6.601562 14.515625 -7.25 14.515625 -7.9375 L 14.515625 -7.984375 C 14.515625 -8.671875 14.394531 -9.316406 14.15625 -9.921875 C 13.914062 -10.535156 13.578125 -11.066406 13.140625 -11.515625 C 12.710938 -11.972656 12.203125 -12.332031 11.609375 -12.59375 C 11.015625 -12.863281 10.367188 -13 9.671875 -13 C 8.953125 -13 8.300781 -12.867188 7.71875 -12.609375 C 7.132812 -12.359375 6.632812 -12.003906 6.21875 -11.546875 C 5.800781 -11.085938 5.472656 -10.554688 5.234375 -9.953125 C 4.992188 -9.359375 4.875 -8.71875 4.875 -8.03125 L 4.875 -7.984375 C 4.875 -7.296875 4.992188 -6.648438 5.234375 -6.046875 C 5.472656 -5.441406 5.804688 -4.910156 6.234375 -4.453125 C 6.671875 -3.992188 7.179688 -3.628906 7.765625 -3.359375 C 8.347656 -3.097656 9 -2.96875 9.71875 -2.96875 Z M 9.71875 -2.96875 " />
                      </g>
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(35.549525, 22.15073)">
                      <g>
                        <path d="M 15.765625 -15.96875 L 10.421875 -8.171875 L 15.984375 0 L 11.890625 0 L 8.296875 -5.46875 L 4.703125 0 L 0.703125 0 L 6.28125 -8.125 L 0.9375 -15.96875 L 5.046875 -15.96875 L 8.375 -10.796875 L 11.765625 -15.96875 Z M 15.765625 -15.96875 " />
                      </g>
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(52.235637, 22.15073)">
                      <g />
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(59.074216, 22.15073)">
                      <g>
                        <path d="M 9.671875 0.28125 C 8.441406 0.28125 7.304688 0.0625 6.265625 -0.375 C 5.234375 -0.8125 4.34375 -1.394531 3.59375 -2.125 C 2.84375 -2.863281 2.253906 -3.734375 1.828125 -4.734375 C 1.410156 -5.734375 1.203125 -6.800781 1.203125 -7.9375 L 1.203125 -7.984375 C 1.203125 -9.128906 1.414062 -10.195312 1.84375 -11.1875 C 2.269531 -12.1875 2.859375 -13.0625 3.609375 -13.8125 C 4.367188 -14.5625 5.269531 -15.15625 6.3125 -15.59375 C 7.351562 -16.03125 8.488281 -16.25 9.71875 -16.25 C 10.945312 -16.25 12.078125 -16.03125 13.109375 -15.59375 C 14.148438 -15.15625 15.046875 -14.566406 15.796875 -13.828125 C 16.546875 -13.097656 17.128906 -12.234375 17.546875 -11.234375 C 17.972656 -10.234375 18.1875 -9.164062 18.1875 -8.03125 L 18.1875 -7.984375 C 18.1875 -6.847656 17.972656 -5.78125 17.546875 -4.78125 C 17.117188 -3.78125 16.523438 -2.90625 15.765625 -2.15625 C 15.015625 -1.40625 14.117188 -0.8125 13.078125 -0.375 C 12.035156 0.0625 10.898438 0.28125 9.671875 0.28125 Z M 9.71875 -2.96875 C 10.414062 -2.96875 11.0625 -3.09375 11.65625 -3.34375 C 12.25 -3.601562 12.753906 -3.960938 13.171875 -4.421875 C 13.585938 -4.878906 13.914062 -5.40625 14.15625 -6 C 14.394531 -6.601562 14.515625 -7.25 14.515625 -7.9375 L 14.515625 -7.984375 C 14.515625 -8.671875 14.394531 -9.316406 14.15625 -9.921875 C 13.914062 -10.535156 13.578125 -11.066406 13.140625 -11.515625 C 12.710938 -11.972656 12.203125 -12.332031 11.609375 -12.59375 C 11.015625 -12.863281 10.367188 -13 9.671875 -13 C 8.953125 -13 8.300781 -12.867188 7.71875 -12.609375 C 7.132812 -12.359375 6.632812 -12.003906 6.21875 -11.546875 C 5.800781 -11.085938 5.472656 -10.554688 5.234375 -9.953125 C 4.992188 -9.359375 4.875 -8.71875 4.875 -8.03125 L 4.875 -7.984375 C 4.875 -7.296875 4.992188 -6.648438 5.234375 -6.046875 C 5.472656 -5.441406 5.804688 -4.910156 6.234375 -4.453125 C 6.671875 -3.992188 7.179688 -3.628906 7.765625 -3.359375 C 8.347656 -3.097656 9 -2.96875 9.71875 -2.96875 Z M 9.71875 -2.96875 " />
                      </g>
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(78.45017, 22.15073)">
                      <g>
                        <path d="M 1.921875 -15.96875 L 14.078125 -15.96875 L 14.078125 -12.78125 L 5.421875 -12.78125 L 5.421875 -9.375 L 13.046875 -9.375 L 13.046875 -6.1875 L 5.421875 -6.1875 L 5.421875 0 L 1.921875 0 Z M 1.921875 -15.96875 " />
                      </g>
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(93.403857, 22.15073)">
                      <g>
                        <path d="M 1.921875 -15.96875 L 14.078125 -15.96875 L 14.078125 -12.78125 L 5.421875 -12.78125 L 5.421875 -9.375 L 13.046875 -9.375 L 13.046875 -6.1875 L 5.421875 -6.1875 L 5.421875 0 L 1.921875 0 Z M 1.921875 -15.96875 " />
                      </g>
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(108.357544, 22.15073)">
                      <g>
                        <path d="M 2.078125 -15.96875 L 5.59375 -15.96875 L 5.59375 0 L 2.078125 0 Z M 2.078125 -15.96875 " />
                      </g>
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(116.016755, 22.15073)">
                      <g>
                        <path d="M 9.40625 0.28125 C 8.226562 0.28125 7.132812 0.0664062 6.125 -0.359375 C 5.125 -0.785156 4.257812 -1.367188 3.53125 -2.109375 C 2.800781 -2.847656 2.226562 -3.71875 1.8125 -4.71875 C 1.40625 -5.726562 1.203125 -6.800781 1.203125 -7.9375 L 1.203125 -7.984375 C 1.203125 -9.128906 1.40625 -10.195312 1.8125 -11.1875 C 2.226562 -12.1875 2.800781 -13.0625 3.53125 -13.8125 C 4.257812 -14.5625 5.132812 -15.15625 6.15625 -15.59375 C 7.175781 -16.03125 8.300781 -16.25 9.53125 -16.25 C 10.28125 -16.25 10.960938 -16.1875 11.578125 -16.0625 C 12.191406 -15.9375 12.75 -15.765625 13.25 -15.546875 C 13.75 -15.335938 14.210938 -15.082031 14.640625 -14.78125 C 15.066406 -14.476562 15.460938 -14.144531 15.828125 -13.78125 L 13.59375 -11.203125 C 12.96875 -11.765625 12.332031 -12.203125 11.6875 -12.515625 C 11.039062 -12.835938 10.316406 -13 9.515625 -13 C 8.847656 -13 8.226562 -12.867188 7.65625 -12.609375 C 7.082031 -12.359375 6.632812 -12.003906 6.171875 -11.546875 C 5.765625 -11.085938 5.445312 -10.554688 5.21875 -9.953125 C 4.988281 -9.359375 4.875 -8.71875 4.875 -8.03125 L 4.875 -7.984375 C 4.875 -7.296875 4.988281 -6.648438 5.21875 -6.046875 C 5.445312 -5.441406 5.765625 -4.910156 6.171875 -4.453125 C 6.578125 -3.992188 7.0625 -3.628906 7.625 -3.359375 C 8.195312 -3.097656 8.828125 -2.96875 9.515625 -2.96875 C 10.421875 -2.96875 11.191406 -3.132812 11.828125 -3.46875 C 12.460938 -3.800781 13.085938 -4.257812 13.703125 -4.84375 L 15.953125 -2.578125 C 15.535156 -2.140625 15.101562 -1.742188 14.65625 -1.390625 C 14.21875 -1.035156 13.738281 -0.734375 13.21875 -0.484375 C 12.695312 -0.234375 12.125 -0.046875 11.5 0.078125 C 10.875 0.210938 10.175781 0.28125 9.40625 0.28125 Z M 9.40625 0.28125 " />
                      </g>
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(132.839632, 22.15073)">
                      <g>
                        <path d="M 1.921875 -15.96875 L 13.96875 -15.96875 L 13.96875 -12.84375 L 5.40625 -12.84375 L 5.40625 -9.609375 L 12.9375 -9.609375 L 12.9375 -6.484375 L 5.40625 -6.484375 L 5.40625 -3.125 L 14.078125 -3.125 L 14.078125 0 L 1.921875 0 Z M 1.921875 -15.96875 " />
                      </g>
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(148.112451, 22.15073)">
                      <g />
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(154.95103, 22.15073)">
                      <g>
                        <path d="M 1.921875 -15.96875 L 8.140625 -15.96875 C 9.390625 -15.96875 10.535156 -15.765625 11.578125 -15.359375 C 12.617188 -14.960938 13.515625 -14.40625 14.265625 -13.6875 C 15.023438 -12.96875 15.609375 -12.125 16.015625 -11.15625 C 16.421875 -10.195312 16.625 -9.15625 16.625 -8.03125 L 16.625 -7.984375 C 16.625 -6.859375 16.421875 -5.804688 16.015625 -4.828125 C 15.609375 -3.859375 15.023438 -3.015625 14.265625 -2.296875 C 13.515625 -1.585938 12.617188 -1.023438 11.578125 -0.609375 C 10.535156 -0.203125 9.390625 0 8.140625 0 L 1.921875 0 Z M 5.421875 -12.796875 L 5.421875 -3.171875 L 8.140625 -3.171875 C 8.859375 -3.171875 9.515625 -3.285156 10.109375 -3.515625 C 10.703125 -3.742188 11.207031 -4.070312 11.625 -4.5 C 12.039062 -4.925781 12.363281 -5.425781 12.59375 -6 C 12.832031 -6.570312 12.953125 -7.21875 12.953125 -7.9375 L 12.953125 -7.984375 C 12.953125 -8.679688 12.832031 -9.328125 12.59375 -9.921875 C 12.363281 -10.515625 12.039062 -11.023438 11.625 -11.453125 C 11.207031 -11.878906 10.703125 -12.207031 10.109375 -12.4375 C 9.515625 -12.675781 8.859375 -12.796875 8.140625 -12.796875 Z M 5.421875 -12.796875 " />
                      </g>
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(172.776905, 22.15073)">
                      <g>
                        <path d="M 1.921875 -15.96875 L 9.21875 -15.96875 C 11.238281 -15.96875 12.789062 -15.425781 13.875 -14.34375 C 14.78125 -13.4375 15.234375 -12.222656 15.234375 -10.703125 L 15.234375 -10.65625 C 15.234375 -9.363281 14.914062 -8.3125 14.28125 -7.5 C 13.65625 -6.6875 12.832031 -6.085938 11.8125 -5.703125 L 15.71875 0 L 11.609375 0 L 8.1875 -5.109375 L 5.421875 -5.109375 L 5.421875 0 L 1.921875 0 Z M 8.984375 -8.21875 C 9.847656 -8.21875 10.515625 -8.421875 10.984375 -8.828125 C 11.453125 -9.234375 11.6875 -9.78125 11.6875 -10.46875 L 11.6875 -10.515625 C 11.6875 -11.273438 11.441406 -11.84375 10.953125 -12.21875 C 10.460938 -12.601562 9.785156 -12.796875 8.921875 -12.796875 L 5.421875 -12.796875 L 5.421875 -8.21875 Z M 8.984375 -8.21875 " />
                      </g>
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(189.257859, 22.15073)">
                      <g>
                        <path d="M 7.390625 -16.078125 L 10.625 -16.078125 L 17.46875 0 L 13.796875 0 L 12.34375 -3.578125 L 5.59375 -3.578125 L 4.125 0 L 0.546875 0 Z M 11.09375 -6.6875 L 8.96875 -11.859375 L 6.84375 -6.6875 Z M 11.09375 -6.6875 " />
                      </g>
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(206.239804, 22.15073)">
                      <g>
                        <path d="M 9.609375 0.28125 C 8.359375 0.28125 7.21875 0.078125 6.1875 -0.328125 C 5.164062 -0.742188 4.285156 -1.316406 3.546875 -2.046875 C 2.804688 -2.773438 2.226562 -3.640625 1.8125 -4.640625 C 1.40625 -5.648438 1.203125 -6.75 1.203125 -7.9375 L 1.203125 -7.984375 C 1.203125 -9.128906 1.410156 -10.195312 1.828125 -11.1875 C 2.253906 -12.1875 2.835938 -13.0625 3.578125 -13.8125 C 4.328125 -14.5625 5.207031 -15.15625 6.21875 -15.59375 C 7.238281 -16.03125 8.359375 -16.25 9.578125 -16.25 C 10.296875 -16.25 10.945312 -16.195312 11.53125 -16.09375 C 12.113281 -16 12.65625 -15.859375 13.15625 -15.671875 C 13.664062 -15.492188 14.140625 -15.265625 14.578125 -14.984375 C 15.015625 -14.710938 15.441406 -14.398438 15.859375 -14.046875 L 13.640625 -11.390625 C 13.335938 -11.640625 13.03125 -11.863281 12.71875 -12.0625 C 12.414062 -12.257812 12.101562 -12.425781 11.78125 -12.5625 C 11.457031 -12.707031 11.101562 -12.816406 10.71875 -12.890625 C 10.34375 -12.960938 9.925781 -13 9.46875 -13 C 8.832031 -13 8.234375 -12.863281 7.671875 -12.59375 C 7.117188 -12.332031 6.632812 -11.976562 6.21875 -11.53125 C 5.800781 -11.082031 5.472656 -10.554688 5.234375 -9.953125 C 4.992188 -9.359375 4.875 -8.71875 4.875 -8.03125 L 4.875 -7.984375 C 4.875 -7.253906 4.992188 -6.582031 5.234375 -5.96875 C 5.472656 -5.351562 5.804688 -4.816406 6.234375 -4.359375 C 6.671875 -3.898438 7.179688 -3.546875 7.765625 -3.296875 C 8.347656 -3.046875 9 -2.921875 9.71875 -2.921875 C 11.03125 -2.921875 12.132812 -3.238281 13.03125 -3.875 L 13.03125 -6.15625 L 9.484375 -6.15625 L 9.484375 -9.1875 L 16.421875 -9.1875 L 16.421875 -2.265625 C 15.597656 -1.554688 14.617188 -0.953125 13.484375 -0.453125 C 12.359375 0.0351562 11.066406 0.28125 9.609375 0.28125 Z M 9.609375 0.28125 " />
                      </g>
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(224.111282, 22.15073)">
                      <g>
                        <path d="M 9.671875 0.28125 C 8.441406 0.28125 7.304688 0.0625 6.265625 -0.375 C 5.234375 -0.8125 4.34375 -1.394531 3.59375 -2.125 C 2.84375 -2.863281 2.253906 -3.734375 1.828125 -4.734375 C 1.410156 -5.734375 1.203125 -6.800781 1.203125 -7.9375 L 1.203125 -7.984375 C 1.203125 -9.128906 1.414062 -10.195312 1.84375 -11.1875 C 2.269531 -12.1875 2.859375 -13.0625 3.609375 -13.8125 C 4.367188 -14.5625 5.269531 -15.15625 6.3125 -15.59375 C 7.351562 -16.03125 8.488281 -16.25 9.71875 -16.25 C 10.945312 -16.25 12.078125 -16.03125 13.109375 -15.59375 C 14.148438 -15.15625 15.046875 -14.566406 15.796875 -13.828125 C 16.546875 -13.097656 17.128906 -12.234375 17.546875 -11.234375 C 17.972656 -10.234375 18.1875 -9.164062 18.1875 -8.03125 L 18.1875 -7.984375 C 18.1875 -6.847656 17.972656 -5.78125 17.546875 -4.78125 C 17.117188 -3.78125 16.523438 -2.90625 15.765625 -2.15625 C 15.015625 -1.40625 14.117188 -0.8125 13.078125 -0.375 C 12.035156 0.0625 10.898438 0.28125 9.671875 0.28125 Z M 9.71875 -2.96875 C 10.414062 -2.96875 11.0625 -3.09375 11.65625 -3.34375 C 12.25 -3.601562 12.753906 -3.960938 13.171875 -4.421875 C 13.585938 -4.878906 13.914062 -5.40625 14.15625 -6 C 14.394531 -6.601562 14.515625 -7.25 14.515625 -7.9375 L 14.515625 -7.984375 C 14.515625 -8.671875 14.394531 -9.316406 14.15625 -9.921875 C 13.914062 -10.535156 13.578125 -11.066406 13.140625 -11.515625 C 12.710938 -11.972656 12.203125 -12.332031 11.609375 -12.59375 C 11.015625 -12.863281 10.367188 -13 9.671875 -13 C 8.953125 -13 8.300781 -12.867188 7.71875 -12.609375 C 7.132812 -12.359375 6.632812 -12.003906 6.21875 -11.546875 C 5.800781 -11.085938 5.472656 -10.554688 5.234375 -9.953125 C 4.992188 -9.359375 4.875 -8.71875 4.875 -8.03125 L 4.875 -7.984375 C 4.875 -7.296875 4.992188 -6.648438 5.234375 -6.046875 C 5.472656 -5.441406 5.804688 -4.910156 6.234375 -4.453125 C 6.671875 -3.992188 7.179688 -3.628906 7.765625 -3.359375 C 8.347656 -3.097656 9 -2.96875 9.71875 -2.96875 Z M 9.71875 -2.96875 " />
                      </g>
                    </g>
                  </g>
                  <g fill="currentColor" fillOpacity={1}> {/* Changed to currentColor */}
                    <g transform="translate(243.487236, 22.15073)">
                      <g>
                        <path d="M 1.921875 -15.96875 L 5.15625 -15.96875 L 12.640625 -6.140625 L 12.640625 -15.96875 L 16.109375 -15.96875 L 16.109375 0 L 13.125 0 L 5.390625 -10.15625 L 5.390625 0 L 1.921875 0 Z M 1.921875 -15.96875 " />
                      </g>
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
};


// --- STANDALONE COMPONENTS ---

const ProfilePage = React.memo(({ currentUser }) => {
    return (
        <div className="max-w-xl mx-auto bg-white p-8 rounded-xl shadow-lg border border-gray-200">
            <h2 className="text-3xl font-bold text-red-900 flex items-center gap-3 mb-6">
                <User size={30} className="text-red-900" />
                Your Profile
            </h2>
            <div className="space-y-4 text-gray-800">
                <p className="border-b pb-2"><strong>Name:</strong> {currentUser.name}</p>
                <p className="border-b pb-2"><strong>Email:</strong> {currentUser.email}</p>
                <p className="border-b pb-2"><strong>Role:</strong> <span className="font-semibold text-red-900">{currentUser.role.toUpperCase()}</span></p>
                
                {currentUser.role === 'buyer' && (
                    <>
                        <p><strong>Discount Rate:</strong> {(currentUser.discount * 100).toFixed(0)}%</p>
                        <p className="mt-4 text-sm text-gray-600">
                            <strong>Accommodations:</strong> {currentUser.hasAccommodations ? 
                                `Handicap: ${currentUser.handicapAccessible ? 'Yes' : 'No'}, Faculty: ${currentUser.facultyRestricted ? 'Yes' : 'No'}` 
                                : 'None specified.'}
                        </p>
                    </>
                )}
            </div>
        </div>
    );
});

const MyTickets = React.memo(({
  userTickets,
  transferTargetEmail,
  setTransferTargetEmail,
  setActiveTab,
  handleReturn,
  handleTransfer,
}) => (
  <div className="space-y-6">
    <h2 className="text-3xl font-bold text-gray-900">My Tickets</h2>
    {userTickets.length === 0 ? (
      <div className="text-center py-16">
        <p className="text-xl text-gray-500 mb-4">You haven't bought a ticket yet.</p>
        <button onClick={() => setActiveTab('events')} className="bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-white hover:border hover:border-red-900 hover:text-red-900 disabled:opacity-50">
          Browse Events
        </button>
      </div>
    ) : (
      <div className="grid gap-6 md:grid-cols-2">
        {userTickets.map(ticket => (
          <div key={ticket.id} className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="bg-gradient-to-r from-blue-700 to-red-700 text-white p-4 rounded-t-xl">
              <h3 className="text-lg font-bold">{ticket.eventName}</h3>
            </div>
            <div className="p-6 bg-gray-50 rounded-b-xl">
              <div className="space-y-2 mb-6 text-gray-700">
                <p><strong>Venue:</strong> {ticket.venue}</p>
                <p><strong>Date:</strong> {ticket.date} at {ticket.time}</p>
                <p><strong>Seat:</strong> Row {ticket.row}, Seat {ticket.column}</p>
                <p className="text-lg font-bold border-t pt-2 text-gray-900">Paid: ${ticket.finalPrice}</p>
              </div>
              <div className="bg-gray-100 p-6 rounded-lg mb-6 text-center">
                <QrCode size={100} className="mx-auto mb-3 text-gray-700" />
                <p className="text-xs font-mono font-bold text-gray-700">QR: {ticket.qrCode}</p>
                <p className="text-sm text-gray-500 mt-2">Alt ID: {ticket.alternateId}</p>
              </div>
              
              <div className="space-y-4">
                <div className="border border-yellow-500 p-3 rounded-lg bg-yellow-50">
                  <p className="font-semibold text-sm mb-2 flex items-center gap-2 text-yellow-800">
                    <Send size={16} /> Transfer Ticket
                  </p>
                  <div className="flex space-x-2">
                    <input
                      type="email"
                      placeholder="Recipient's Email"
                      value={transferTargetEmail[ticket.id] || ''}
                      onChange={(e) => 
                        setTransferTargetEmail(prev => ({ ...prev, [ticket.id]: e.target.value }))
                      }
                      className="flex-grow p-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900"
                    />
                    <button 
                      onClick={() => handleTransfer(ticket.id)} 
                      disabled={!transferTargetEmail[ticket.id] || !transferTargetEmail[ticket.id].includes('@')}
                      className="flex-shrink-0 bg-yellow-600 text-white px-3 py-2 rounded-lg hover:bg-yellow-700 font-medium text-sm disabled:opacity-50"
                    >
                      Transfer
                    </button>
                  </div>
                </div>

                <button 
                  onClick={() => handleReturn(ticket.id)} 
                  className="w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 font-medium"
                >
                  Return Ticket & Get Refund (${ticket.finalPrice})
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
));


const TicketValidation = React.memo(({ currentUser }) => {
  const [scanId, setScanId] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleValidation = async () => {
    setValidationResult(null);
    const id = scanId.trim();
    if (!id) return;

    setLoading(true);
    try {
      // Use Firebase API stub
      const result = await firebaseApi.validateTicket(id, currentUser.id);
      setValidationResult(result);
      setScanId('');
    } catch (error) {
      setValidationResult({ 
        valid: false, 
        status: 'invalid', 
        message: 'Error validating ticket. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
  };

  const getResultStyle = (status) => {
    switch (status) {
      case 'valid': return 'bg-green-100 text-green-800 border-green-600';
      case 'used': return 'bg-yellow-100 text-yellow-800 border-yellow-600';
      case 'invalid': return 'bg-red-100 text-red-800 border-red-600';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-gray-900">Ticket Validation</h2>
      <div className="bg-white rounded-xl shadow-lg p-6 max-w-lg mx-auto">
        <p className="text-lg font-semibold mb-4 text-gray-700">Scan QR Code or Enter Alternate ID</p>
        <div className="flex space-x-2 mb-4">
          <input 
            type="text" 
            value={scanId} 
            onChange={(e) => setScanId(e.target.value)} 
            placeholder="QR Code or Alt ID" 
            className="flex-grow p-3 border-2 rounded-lg text-lg bg-white text-gray-900 border-gray-300 focus:border-red-900"
            onKeyPress={(e) => {if (e.key === 'Enter') handleValidation();}}
            disabled={loading}
          />
          <button 
            onClick={handleValidation} 
            className="flex-shrink-0 bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 font-medium disabled:opacity-50"
            disabled={!scanId.trim() || loading}
          >
            {loading ? 'Validating...' : 'Validate'}
          </button>
        </div>

        {validationResult && (
          <div className={`p-4 mt-6 border-l-4 rounded-lg ${getResultStyle(validationResult.status)}`}>
            <div className="flex items-center gap-3 mb-2">
              {validationResult.status === 'valid' && <CheckCircle size={24} className="text-green-600" />}
              {(validationResult.status === 'invalid' || validationResult.status === 'used') && <XCircle size={24} className="text-red-600" />}
              <p className="text-xl font-bold">{validationResult.status?.toUpperCase()} TICKET</p>
            </div>
            <p className="font-semibold text-gray-800">{validationResult.message}</p>
            
            {validationResult.ticket && (
              <div className="mt-3 border-t pt-3 text-gray-700">
                <p><strong>Event:</strong> {validationResult.ticket.eventName}</p>
                <p><strong>Seat:</strong> Row {validationResult.ticket.row}, Seat {validationResult.ticket.column}</p>
                <p><strong>Entry Requirement:</strong> {validationResult.ticket.isFacultyOnly ? 
                  <span className="text-red-600 font-bold">Faculty Only Seat</span> : 'Standard'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// --- ADMIN MANAGEMENT COMPONENT HELPERS ---
const getBasketballSeatsTemplate = () => {
    const seats = [];
    for (let i = 0; i < 400; i++) {
        const row = Math.floor(i / 20) + 1;
        const col = (i % 20) + 1;
        const tier = i < 80 ? 'premium' : i < 240 ? 'standard' : 'economy';
        const price = i < 80 ? 85 : i < 240 ? 45 : 25;
        const isHandicap = i % 25 === 0;
        const isFaculty = (i % 30 === 0 && i < 60);
        
        seats.push({
            id: `seat-${i+1}`,
            row: row,
            column: col,
            tier: tier,
            price: price,
            isHandicap: isHandicap,
            isFacultyOnly: isFaculty,
            isBooked: false
        });
    }
    return seats;
};

// --- EVENT MANAGEMENT COMPONENT (Hoisted for stability) ---
const EventManagement = React.memo(({ events, loadEvents, loading, setNewEvent, newEvent, handleDeleteEvent, handleCreateEvent }) => (
    <div className="space-y-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-4">Event Management</h3>
        
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
            <h4 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <PlusCircle size={20} className="text-red-900" /> Create New Event
            </h4>
            <div className="grid grid-cols-2 gap-4">
                <input type="text" key="create-name" placeholder="Name" value={newEvent.name} onChange={e => setNewEvent({...newEvent, name: e.target.value})} className="p-3 bg-gray-50 border border-gray-300 rounded text-gray-900" />
                <input type="text" key="create-venue" placeholder="Venue" value={newEvent.venue} onChange={e => setNewEvent({...newEvent, venue: e.target.value})} className="p-3 bg-gray-50 border border-gray-300 rounded text-gray-900" />
                {/* FIX: Set date input to text for manual MM/DD/YYYY entry and stability */}
                <input type="text" key="create-date" placeholder="Date (MM/DD/YYYY)" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} className="p-3 bg-gray-50 border border-gray-300 rounded text-gray-900" />
                <input type="time" key="create-time" placeholder="Time" value={newEvent.time} onChange={e => setNewEvent({...newEvent, time: e.target.value})} className="p-3 bg-gray-50 border border-gray-300 rounded text-gray-900" />
                <input type="number" key="create-capacity" placeholder="Capacity (e.g., 5000)" value={newEvent.capacity} onChange={e => setNewEvent({...newEvent, capacity: parseInt(e.target.value) || 0})} className="p-3 bg-gray-50 border border-gray-300 rounded text-gray-900" />
                <select key="create-category" value={newEvent.category} onChange={e => setNewEvent({...newEvent, category: e.target.value})} className="p-3 bg-gray-50 border border-gray-300 rounded text-gray-900">
                    <option value="Sports">Sports</option>
                    <option value="Theatre">Theatre</option>
                    <option value="Music">Music</option>
                    <option value="Other">Other</option>
                </select>
            </div>
            <textarea key="create-description" placeholder="Description" value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} className="w-full mt-4 p-3 bg-gray-50 border border-gray-300 rounded text-gray-900 h-24"></textarea>
            <button onClick={handleCreateEvent} disabled={loading} className="w-full mt-4 bg-red-900 text-white py-3 rounded-lg hover:bg-red-800 disabled:opacity-50">
                {loading ? 'Creating...' : 'Create Event'}
            </button>
        </div>

        <h4 className="text-xl font-semibold text-gray-900 mb-2">Existing Events</h4>
        <div className="space-y-3">
            {events.map(event => (
                <div key={event.id} className="bg-white p-4 rounded-lg flex items-center justify-between border border-gray-200 shadow-sm">
                    <div className="flex-grow">
                        <p className="font-bold text-lg text-red-900">{event.name}</p>
                        <p className="text-sm text-gray-600">{event.venue} - {event.date}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => handleDeleteEvent(event.id, event.name)} className="p-2 bg-red-600 rounded-lg text-white hover:bg-red-700" title="Delete Event" disabled={loading}>
                            <Trash2 size={18} />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    </div>
));

// --- USER MANAGEMENT COMPONENT (Hoisted for stability) ---
const UserManagement = React.memo(({ allUsers, filteredUsers, loading, searchQuery, setSearchQuery, fetchUsers }) => (
    <div className="space-y-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-4">User Management</h3>
        <div className="flex items-center bg-white p-3 rounded-xl border border-gray-300 shadow-sm">
            <Search size={20} className="text-gray-400 mr-3" />
            {/* FIX: Added stable key to Search input to prevent focus loss */}
            <input 
                type="text" 
                key="user-search-input" 
                placeholder="Search users by name, username, or email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-grow p-1 bg-transparent text-gray-900 focus:outline-none"
            />
        </div>

        {loading ? (
            <p className="text-gray-500">Loading user list...</p>
        ) : (
            <div className="space-y-3">
                {filteredUsers.map(user => (
                    <div key={user.id} className="bg-white p-4 rounded-lg flex items-center justify-between border border-gray-200 shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                            <p className="font-bold text-xl text-gray-900">{user.name}</p>
                            <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                                user.role === 'admin' ? 'bg-red-100 text-red-800' :
                                user.role === 'enforcer' ? 'bg-purple-100 text-purple-800' :
                                'bg-blue-100 text-blue-800'
                            }`}>
                                {user.role.toUpperCase()}
                            </span>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                            <p><strong>Username:</strong> {user.username}</p>
                            <p><strong>Email:</strong> {user.email}</p>
                            <p><strong>Joined:</strong> {new Date(user.createdAt).toLocaleDateString()}</p>
                            {user.role === 'buyer' && (
                                <p>
                                    <strong>Accommodations:</strong> 
                                    {user.hasAccommodations ? 
                                        <span className="text-yellow-700 ml-1">Yes (Handicap: {user.handicapAccessible ? 'Y' : 'N'}, Faculty: {user.facultyRestricted ? 'Y' : 'N'})</span> : 
                                        ' No'
                                    }
                                </p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
));


// --- ADMIN MANAGEMENT CONTAINER ---
const AdminManagement = ({ loadEvents, events }) => {
    const [allUsers, setAllUsers] = useState([]);
    const [view, setView] = useState('users'); 
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [newEvent, setNewEvent] = useState({
        name: '', venue: '', date: '', time: '19:00:00', capacity: 0, description: '', category: 'Sports'
    });
    
    const filteredUsers = allUsers.filter(user => 
        user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const data = await firebaseApi.getUsers();
            setAllUsers(data);
        } catch (err) {
            console.error('Failed to fetch users:', err);
        } finally {
            setLoading(false);
        }
    }, []);


    useEffect(() => {
        if (view === 'users') {
            fetchUsers();
        }
    }, [view, fetchUsers]);

    const handleCreateEvent = async () => {
        if (!newEvent.name || !newEvent.venue || !newEvent.date || !newEvent.capacity || newEvent.capacity <= 0) {
            alert('Please fill out all required event fields (Name, Venue, Date, Capacity > 0).');
            return;
        }
        setLoading(true);
        try {
            // FIX 2: Convert MM/DD/YYYY to YYYY-MM-DD for database consistency before saving
            const dateParts = newEvent.date.split('/');
            if (dateParts.length !== 3) {
                 alert('Date must be in MM/DD/YYYY format.');
                 setLoading(false);
                 return;
            }
            const [month, day, year] = dateParts;
            const formattedDate = `${year}-${month}-${day}`;

            const eventPayload = {
                ...newEvent,
                date: formattedDate 
            };

            const defaultSeats = getBasketballSeatsTemplate(); 
            const result = await firebaseApi.createEvent(eventPayload, defaultSeats);
            alert(`Success: ${result.message}`);
            loadEvents(); 
            setNewEvent({ name: '', venue: '', date: '', time: '19:00:00', capacity: 0, description: '', category: 'Sports' });
            setView('events'); 
        } catch (err) {
            alert('Failed to create event. Check console for details.');
            console.error('Create event error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteEvent = async (eventId, eventName) => {
        if (!window.confirm(`WARNING: Are you sure you want to delete the event "${eventName}"? This will delete the event record and cannot be undone.`)) return;

        setLoading(true);
        try {
            const result = await firebaseApi.deleteEvent(eventId);
            alert(`Success: ${result.message}`);
            loadEvents(); 
        } catch (err) {
            alert('Failed to delete event. Check console.');
            console.error('Delete event error:', err);
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-900">Administrator Panel</h2>

            <div className="flex space-x-4 border-b border-gray-300 pb-2">
                <button 
                    onClick={() => setView('users')} 
                    className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                        view === 'users' ? 'bg-gray-100 text-red-900 border-b-2 border-red-900' : 'text-gray-600 hover:bg-gray-200'
                    }`}
                >
                    User Lookup ({allUsers.length})
                </button>
                <button 
                    onClick={() => setView('events')} 
                    className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                        view === 'events' ? 'bg-gray-100 text-red-900 border-b-2 border-red-900' : 'text-gray-600 hover:bg-gray-200'
                    }`}
                >
                    Event CRUD ({events.length})
                </button>
            </div>

            {/* The structural fix ensures the entire inner component is swapped cleanly */}
            {view === 'users' ? 
                <UserManagement 
                    key="user-management-view" 
                    allUsers={allUsers}
                    filteredUsers={filteredUsers}
                    loading={loading}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    fetchUsers={fetchUsers}
                /> : 
                <EventManagement 
                    key="event-management-view" 
                    events={events}
                    loadEvents={loadEvents}
                    loading={loading}
                    setNewEvent={setNewEvent}
                    newEvent={newEvent}
                    handleDeleteEvent={handleDeleteEvent}
                    handleCreateEvent={handleCreateEvent}
                />
            }
        </div>
    );
};


// --- HOISTED REGISTRATION FORM COMPONENT ---
const RegistrationForm = React.memo(({
    setMessage,
    setIsRegistering,
}) => {
    const [regName, setRegName] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regError, setRegError] = useState(null);
    const [regLoading, setRegLoading] = useState(false);

    const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;

    const handleRegister = async () => {
        setRegError(null);
        setMessage(null);

        if (!regName || !regPassword || !regEmail) {
            setRegError('All fields are required.');
            return;
        }
        if (regPassword.length < 6) {
            setRegError('Password must be at least 6 characters long.');
            return;
        }
        if (!regEmail.match(emailRegex)) {
            setRegError('Please enter a valid email address.');
            return;
        }
        
        setRegLoading(true);
        try {
            const data = await firebaseApi.register(regName, regEmail, regPassword);
            setMessage({ type: 'success', text: data.message || 'Registration successful. You can now log in.' });
            
            setRegName('');
            setRegEmail('');
            setRegPassword('');
            setIsRegistering(false); 
        } catch (err) {
            setRegError(err.message || 'Registration failed. Check if email is already in use.');
            console.error('Registration failed:', err.message);
        } finally {
            setRegLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold text-center text-gray-900">Sign Up (New Buyer Account)</h2>
            {regError && (
                <p className="text-red-600 font-semibold text-center bg-red-100 p-2 rounded border border-red-400">
                    {regError}
                </p>
            )}
            
            <input type="text" value={regName} onChange={e => setRegName(e.target.value)} placeholder="Full Name" className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900" />
            <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="Email Address (e.g., user@cofc.edu)" className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900" />
            <input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="Password (min 6 chars)" className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900" />
            
            <button onClick={handleRegister} disabled={regLoading} 
              style={{ backgroundColor: '#bfa87c' }}
              className="w-full text-white py-3 rounded-lg font-semibold transition-all duration-200 
            hover:bg-white hover:border hover:border-red-900 hover:text-red-900 
            disabled:opacity-50">
                {regLoading ? 'Signing Up...' : 'Sign Up'}
            </button>
            <p className="text-center text-sm text-gray-600">
                Already have an account? <button onClick={() => setIsRegistering(false)} className="text-red-900 hover:underline">Log In</button>
            </p>
        </div>
    );
});

// --- HOISTED LOGIN FORM COMPONENT ---
const LoginForm = React.memo(({
    loginError,
    setLoginError,
    loading,
    message,
    setMessage,
    setIsRegistering,
    handleLogin,
}) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const onSubmit = () => {
        if (!email || !password) {
            setLoginError(true);
            setMessage({ type: 'error', text: 'Please enter both email and password.' });
            return;
        }
        // Pass local state data up to the parent App component's handler
        handleLogin(email, password); 
    };

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold text-center text-gray-900">Log In</h2>
            {message && (
                <div className={`p-2 rounded border ${
                    message.type === 'success' ? 'bg-green-100 border-green-500 text-green-700' : 'bg-red-100 border-red-500 text-red-700'
                }`}>
                    {message.text}
                </div>
            )}
            {loginError && (
              <p className="text-red-600 font-semibold text-center bg-red-100 p-2 rounded border border-red-400">
                {/* Displaying specific Firebase errors when available */}
                {message?.type === 'error' && message.text.includes('Invalid credentials') 
                  ? 'Incorrect email or password.' 
                  : 'Invalid Email or Password.'}
              </p>
            )}
            
            <input 
              type="email" 
              value={email} 
              onChange={(e) => {setEmail(e.target.value); setLoginError(false);}} 
              placeholder="Email" 
              className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900" 
            />
            <input 
              type="password" 
              value={password} 
              onChange={(e) => {setPassword(e.target.value); setLoginError(false);}} 
              placeholder="Password" 
              className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900" 
            />
            <button onClick={onSubmit} disabled={loading} className="w-full bg-red-900 text-white py-3 rounded-lg hover:bg-white hover:border hover:border-red-900 hover:text-red-900 disabled:opacity-50">
              {loading ? 'Logging In...' : 'Log In'}
            </button>
            <p className="text-center text-sm text-gray-600">
                Don't have an account? <button onClick={() => setIsRegistering(true)} className="text-red-900 hover:underline">Sign Up</button>
            </p>
        </div>
    );
});

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('events');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [userTickets, setUserTickets] = useState([]);
  const [events, setEvents] = useState([]);
  const [transferTargetEmail, setTransferTargetEmail] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isRegistering, setIsRegistering] = useState(false); 
  const [message, setMessage] = useState(null); 
  const [isAuthReady, setIsAuthReady] = useState(false);
  // NEW STATE: Flag set only after the first successful data load (stable)
  const [isEventsDataLoaded, setIsEventsDataLoaded] = useState(false); 
  // NEW STATE: Flag to control profile menu visibility
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  
  // State for login forms (lifted from the Login component)
  // These are only used by the handleLogin wrapper and no longer passed to the form inputs
  const [loginError, setLoginError] = useState(false); 
  
  // Updated handler now receives data from the form's local state
  const handleLogin = async (email, password) => {
      setMessage(null);

      if (!email || !password) {
        setLoginError(true);
        return;
      }

      try {
        setLoading(true);
        await firebaseApi.login(email, password); 
      } catch (err) {
        setLoginError(true);
        // Map common Firebase auth errors to user-friendly messages
        let errorMessage;
        switch (err.code) {
            case 'auth/invalid-email':
                errorMessage = 'Invalid email format.';
                break;
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                errorMessage = 'Invalid credentials. Please check email and password.';
                break;
            case 'auth/operation-not-allowed':
                errorMessage = 'Sign-in is disabled. Contact system administrator.';
                break;
            default:
                errorMessage = 'Login failed. Please try again.';
        }
          
        setMessage({ type: 'error', text: errorMessage });
        console.error("Login failed:", err.code || err.message); 
      } finally {
        setLoading(false);
      }
    };

  // Clear messages after a delay
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);
  
  // 1. AUTH STATE LISTENER: Tracks Firebase login status and fetches profile
  useEffect(() => {
    if (!auth) return; // Prevent crash if auth is undefined due to init error
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Fetch the user's custom profile (role, name, discount) from Firestore
            try {
                // We use the same login logic to fetch the profile
                const docRef = doc(getUserProfilesPath(), user.uid);
                const docSnap = await getDoc(docRef);

                if (!docSnap.exists()) {
                    await firebaseApi.logout();
                    // Log out here if user exists but profile doesn't (Security rule issue or manual creation without profile)
                    console.error("Login rejected: User profile missing in Firestore.");
                    throw new Error("User profile not found. Contact admin.");
                }

                const profile = docSnap.data();
                setCurrentUser({
                    ...profile,
                    id: user.uid,
                    email: user.email,
                });
                
                // --- FIXED ROLE-BASED NAVIGATION ---
                if (profile.role === 'admin') setActiveTab('admin'); // Admin Management
                else if (profile.role === 'enforcer') setActiveTab('validate'); // Ticket Validation
                else setActiveTab('events'); // Default to Events
                // ------------------------------------

            } catch (e) {
                console.error("Failed to load user profile after auth success:", e);
                setCurrentUser(null);
            }
        } else {
            setCurrentUser(null);
        }
        setIsAuthReady(true);
    });
    return () => unsubscribe;
  }, []);

  // 2. DATA LISTENER: Hooks into Firestore events collection for real-time updates
  // FIX: Stabilized the callback using useMemo
  const loadEvents = useMemo(() => {
      // The function needs stable references to its dependencies outside of 'events.length'
      
      // Return a function that creates the listener closure
      return () => {
          if (!db || !isAuthReady || (!currentUser && !initError)) return undefined; 
          
          const q = getPublicEventsPath();
          
          const unsubscribe = onSnapshot(q, (snapshot) => {
              const eventList = snapshot.docs.map(doc => ({
                  ...doc.data(),
              })).sort((a, b) => new Date(a.date) - new Date(b.date)); // Sort by date
              
              setEvents(eventList);
              setError(null); 
              setLoading(false); 
              setIsEventsDataLoaded(true); // CONFIRM DATA LOADED SUCCESSFULLY
              
          }, (err) => {
              // This path is hit on network errors or permission denied issues
              console.error("Error fetching real-time events:", err);
              
              // Set error only if the network failed
              setError('Failed to load events. Check your connection or console.');
              setLoading(false);
              setIsEventsDataLoaded(true); // Even if failed, loading attempt completed
          });
          return () => unsubscribe;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, isAuthReady]); // Dependencies are only stable props/state used in the outer closure
  
  useEffect(() => {
      let unsubscribe;
      if (currentUser?.role === 'buyer' || currentUser?.role === 'admin' || !currentUser) {
          const result = loadEvents();
          if (typeof result === 'function') {
              unsubscribe = result;
          }
      }
      return () => {
          if (unsubscribe) unsubscribe();
      };
  }, [currentUser, loadEvents]);


  // 3. TICKET LISTENER: Hooks into Firestore tickets collection
  useEffect(() => {
    if (currentUser?.role === 'buyer') {
      if (!db) return; // Prevent crash if db is undefined
      
      const q = getUserTicketsPath(currentUser.id);
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const ticketsList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        setUserTickets(ticketsList);
      }, (err) => {
        console.error("Error fetching user tickets:", err);
      });
      return () => unsubscribe;
    }
    return undefined;
  }, [currentUser]);


  const loadEventDetails = async (event) => {
    setSelectedEvent(event);
  };

  const handleReturn = useCallback(async (ticketId) => {
    const ticket = userTickets.find(t => t.id === ticketId);
    if (!ticket) return;

    if (window.confirm(`Return ticket for ${ticket.eventName}?\n\nSeat: Row ${ticket.row}, Seat ${ticket.column}\nRefund: $${ticket.finalPrice}\n\nRefund will be processed in 1-2 business days.`)) {
      try {
        await firebaseApi.returnTicket(ticket.id, currentUser.id);
        // State update is handled by listeners
        alert(`Ticket return simulated! Refund of $${ticket.finalPrice} will be processed.`);
      } catch (err) {
        alert('Failed to return ticket. Check console.');
      }
    }
  }, [userTickets, currentUser]);

  const handleTransfer = useCallback(async (ticketId) => {
    const email = transferTargetEmail[ticketId];
    if (!email || !email.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    const ticket = userTickets.find(t => t.id === ticketId);
    if (!ticket) return;

    if (window.confirm(`CONFIRM TRANSFER:\n\nTransfer ticket for ${ticket.eventName} to ${email}? This action cannot be undone.`)) {
      try {
        await firebaseApi.transferTicket(ticket.id, currentUser.id, email);
        setTransferTargetEmail(prev => {
          const newState = { ...prev };
          delete newState[ticketId];
          return newState;
        });
      } catch (err) {
        alert('Failed to transfer ticket. Check console.');
      }
    }
  }, [userTickets, transferTargetEmail, currentUser]);
  
  // Loading Bar component for perceived performance
  const LoadingBar = () => (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-900 p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-6">Box Office Dragon</h1>
        <div className="bg-gray-200 rounded-full h-3 overflow-hidden shadow-lg">
          {/* Simulated progress width */}
          <div className="bg-red-900 h-full transition-all duration-1000 ease-in-out" style={{ width: '85%' }}></div>
        </div>
        <p className="text-center text-gray-600 mt-4">Authenticating and loading user data...</p>
      </div>
    </div>
  );


// --- LOGIN COMPONENT (Stable definition) ---
  const LoginComponent = () => {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-6 text-gray-900 flex items-center justify-center gap-3">
            <BoxOfficeDragonLogo size={32} theme="dark" />
          </h1>
          {isRegistering ? (
            <RegistrationForm 
              setIsRegistering={setIsRegistering} 
              setMessage={setMessage}
            />
          ) : (
            <LoginForm 
              handleLogin={handleLogin}
              loading={loading}
              loginError={loginError}
              setIsRegistering={setIsRegistering}
              message={message}
              setLoginError={setLoginError}
              setMessage={setMessage}
            />
          )}
          
          <div className="mt-6 text-sm text-gray-500 text-center border-t border-gray-200 pt-4">
            <p>Admin/Enforcer accounts must be manually created and configured in Firebase.</p>
            <p className="mt-1">New Sign Ups automatically become **Buyer** accounts (10% discount).</p>
          </div>
        </div>
      </div>
    );
  };
// ------------------------------------------------

// --- PROFILE MENU DROPDOWN COMPONENT ---
const ProfileMenu = ({ currentUser, setActiveTab, setIsProfileMenuOpen }) => {
    const menuRef = useRef(null);

    const handleProfileClick = () => {
        setActiveTab('profile');
        setIsProfileMenuOpen(false);
    };

    const handleLogoutClick = () => {
        firebaseApi.logout();
        setIsProfileMenuOpen(false);
    };

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsProfileMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [setIsProfileMenuOpen]);

    return (
        <div 
            ref={menuRef}
            className="absolute right-0 mt-2 w-56 origin-top-right rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10"
        >
            <div className="py-1">
                <div className="px-4 py-2 text-sm text-gray-700 border-b border-gray-100">
                    <p className="font-semibold">{currentUser.name}</p>
                    <p className="text-xs text-red-900">{currentUser.role.toUpperCase()}</p>
                </div>
                
                <button 
                    onClick={handleProfileClick} 
                    className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                    <User size={18} className="mr-3 text-red-900" />
                    View Profile
                </button>
                
                <button 
                    onClick={handleLogoutClick} 
                    className="flex w-full items-center px-4 py-2 text-sm text-red-700 hover:bg-red-50 hover:text-red-900"
                >
                    <LogOut size={18} className="mr-3 text-red-900" />
                    Logout
                </button>
            </div>
        </div>
    );
};

const EventList = () => (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-gray-900">Available Events</h2>
      
      {/* 1. Show Loading State (if data hasn't loaded or is actively loading) */}
      {(!isEventsDataLoaded && !error) || loading ? (
          <p className="text-gray-600">Loading events...</p>
      ) : 
          // 2. The Final Condition: Check if the list is empty (Highest Priority if loaded)
          events.length === 0 ? ( 
              <div className="bg-white p-8 rounded-xl text-center shadow-md border border-gray-200">
                  <Calendar size={32} className="mx-auto text-gray-500 mb-3" />
                  <p className="text-xl font-semibold text-gray-800">No Events Scheduled</p>
                  <p className="text-gray-600 mt-2">Please check back later or contact an administrator to add events.</p>
              </div>
          ) : 
          // 3. Check for Hard Error (Lowest priority, only shows if list is non-empty or loading finished)
          error ? (
              <p className="text-red-600">{error}</p>
          ) : (
        // 4. Display Events
        <div className="grid gap-6 md:grid-cols-2">
          {events.map(event => (
            <div 
              key={event.id} 
              className="bg-white text-gray-900 rounded-xl shadow-md p-6 cursor-pointer hover:bg-gray-100 border border-gray-200" 
              onClick={() => loadEventDetails(event)}
            >
              <h3 className="text-xl font-bold mb-3">{event.name}</h3>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex items-center gap-2"><MapPin size={16} className="text-gray-600" /><span>{event.venue}</span></div>
                <div className="flex items-center gap-2"><Calendar size={16} className="text-gray-600" /><span>{event.date} at {event.time}</span></div>
                <div className="flex items-center gap-2"><Users size={16} className="text-gray-600" /><span>{Math.round((event.booked_seats / event.capacity) * 100)}% full</span></div>
              </div>
              <p className="text-gray-700 text-sm">{event.description}</p>
              <div className="mt-4 h-2 bg-gray-200 rounded">
                <div className="h-2 bg-red-900 rounded" style={{ width: `${(event.booked_seats / event.capacity) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const SeatSelection = () => {
    if (!selectedEvent) return <EventList />;

    // Restrict seat booking if the current user is an admin
    const isAdmin = currentUser.role === 'admin';
    const canBook = !isAdmin;

    const handleSeatSelect = (seat) => {
      if (seat.isBooked || !canBook) return;
      setSelectedSeat(seat);
    };

    const getSeatColor = (seat) => {
      if (seat.isBooked) return 'bg-gray-400 cursor-not-allowed';
      if (seat.id === selectedSeat?.id) return 'bg-red-900 text-white';
      if (seat.tier === 'premium') return 'bg-yellow-400 text-gray-900';
      if (seat.tier === 'standard') return 'bg-blue-600 text-white';
      return 'bg-green-600 text-white';
    };

    const bookSeat = async () => {
      if (!canBook) return alert("Administrators cannot purchase tickets.");

      const discount = currentUser.discount || 0.0;
      const originalPrice = selectedSeat.price;
      const finalPrice = (originalPrice * (1 - discount)).toFixed(2);
      
      try {
        setLoading(true);
        await firebaseApi.bookTicket(
            currentUser.id, 
            selectedEvent.id, 
            selectedSeat.id, 
            parseFloat(finalPrice), 
            originalPrice, 
            discount
        );
        setSelectedSeat(null);
        alert('Ticket booked successfully! State should update shortly.');
      } catch (err) {
        alert('Failed to book ticket. The seat may no longer be available. Reload the page.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    // Safely access seats, defaulting to an empty array
    const seats = selectedEvent.auditoriums?.[0]?.seats || []; 

    return (
      <div className="space-y-6">
        <button onClick={() => {setSelectedEvent(null); setSelectedSeat(null);}} className="text-red-900 hover:text-red-700">
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-gray-900">{selectedEvent.name}</h2>

        {isAdmin && <p className="text-red-600 font-bold mb-4">NOTE: Admin accounts cannot purchase tickets.</p>}
        
        {selectedEvent.auditoriums?.map(aud => (
          <div key={aud.id} className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="text-center mb-6 bg-gray-100 text-gray-900 py-3 rounded-lg border border-gray-300">STAGE</div>
            <div className="grid gap-1 justify-center" style={{gridTemplateColumns: 'repeat(20, 1fr)'}}>
              {aud.seats?.map(seat => (
                <button 
                  key={seat.id} 
                  onClick={() => handleSeatSelect(seat)} 
                  disabled={seat.isBooked || !canBook} // Disable if admin
                  className={`w-7 h-7 text-xs rounded ${getSeatColor(seat)}`}
                >
                  {seat.column}
                </button>
              ))}
            </div>
            {selectedSeat && canBook && (
              <div className="mt-6 p-4 bg-gray-100 rounded-lg border border-gray-200">
                <p className="text-gray-900">Row {selectedSeat.row}, Seat {selectedSeat.column}</p>
                <p className="text-gray-900">Price: ${selectedSeat.price}</p>
                {currentUser.role === 'buyer' && currentUser.discount > 0 && (
                  <p className="text-red-900">Discount: -${(selectedSeat.price * currentUser.discount).toFixed(2)}</p>
                )}
                <p className="font-bold text-gray-900">
                  Final: ${currentUser.role === 'buyer' ? 
                    (selectedSeat.price * (1 - currentUser.discount)).toFixed(2) : 
                    selectedSeat.price}
                </p>
                <button 
                  onClick={bookSeat} 
                  disabled={loading}
                  className="mt-3 bg-red-900 text-white px-4 py-2 rounded hover:bg-red-800 disabled:opacity-50"
                >
                  {loading ? 'Booking...' : 'Book Seat'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (initError) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-red-700 p-6">
              <XCircle size={48} className="text-red-600 mb-4" />
              <h1 className="text-2xl font-bold mb-2">Application Error</h1>
              <p className="text-red-700 text-center">{initError}</p>
              <p className="mt-4 text-sm text-red-500">Please check the console for more details on the initialization failure.</p>
          </div>
      );
  }

  if (!isAuthReady) return <LoadingBar />;
  if (!currentUser) return (
    <LoginComponent />
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <div className="bg-red-900 text-white shadow-md border-b border-red-700">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BoxOfficeDragonLogo size={24} theme="light" />
          </h1>
          <div className="flex gap-4 items-center relative">
            {/* Conditional tabs based on user role */}
            {currentUser.role === 'admin' && (
                <button onClick={() => { setActiveTab('admin'); setIsProfileMenuOpen(false); }} className={`px-4 py-2 rounded ${activeTab === 'admin' ? 'bg-red-800' : ''}`}>
                  Admin Management
                </button>
            )}
            
            {(currentUser.role === 'buyer' || currentUser.role === 'admin') && (
              <button onClick={() => { setActiveTab('events'); setSelectedEvent(null); setIsProfileMenuOpen(false); }} className={`px-4 py-2 rounded ${activeTab === 'events' ? 'bg-red-800' : ''}`}>
                Events
              </button>
            )}
            
            {currentUser.role === 'buyer' && (
              <button onClick={() => { setActiveTab('tickets'); setIsProfileMenuOpen(false); }} className={`px-4 py-2 rounded ${activeTab === 'tickets' ? 'bg-red-800' : ''}`}>
                My Tickets
              </button>
            )}

            {currentUser.role === 'enforcer' && (
              <button onClick={() => { setActiveTab('validate'); setIsProfileMenuOpen(false); }} className={`px-4 py-2 rounded ${activeTab === 'validate' ? 'bg-red-800' : ''}`}>
                Validate Tickets
              </button>
            )}
            
            {/* PROFILE/LOGOUT DROPDOWN TOGGLE */}
            <div className="relative">
                <button 
                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                    style={{ color: '#bfa87c' }} 
                    className="text-sm font-medium hover:text-white flex items-center gap-1 cursor-pointer transition"
                >
                    <User size={18} />
                    {currentUser.name || currentUser.email.split('@')[0]}
                </button>
                
                {isProfileMenuOpen && (
                    <ProfileMenu 
                        currentUser={currentUser} 
                        setActiveTab={setActiveTab} 
                        setIsProfileMenuOpen={setIsProfileMenuOpen} 
                    />
                )}
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'admin' && currentUser.role === 'admin' && <AdminManagement loadEvents={loadEvents} events={events} />}
        {activeTab === 'events' && <SeatSelection />}
        {activeTab === 'tickets' && currentUser.role === 'buyer' && (
          <MyTickets 
            userTickets={userTickets}
            transferTargetEmail={transferTargetEmail}
            setTransferTargetEmail={setTransferTargetEmail}
            setActiveTab={setActiveTab}
            handleReturn={handleReturn}
            handleTransfer={handleTransfer}
          />
        )}
        {activeTab === 'validate' && currentUser.role === 'enforcer' && (
          <TicketValidation currentUser={currentUser} />
        )}
        {activeTab === 'profile' && <ProfilePage currentUser={currentUser} />}
      </div>
    </div>
  );
}

export default App;
