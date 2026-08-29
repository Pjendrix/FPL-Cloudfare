const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAVwWqJx7AGyHvqD-fqwKHs_KcVsFxOYDM",
  authDomain: "fpl-helper-a43a3.firebaseapp.com",
  projectId: "fpl-helper-a43a3",
  storageBucket: "fpl-helper-a43a3.firebasestorage.app",
  messagingSenderId: "939759558646",
  appId: "1:939759558646:web:b66272823b5cc7a71471d7",
};

if(FIREBASE_CONFIG.projectId){
  try{
    const V = "11.0.2";
    const [{initializeApp}, auth, store] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
    ]);

    const app = initializeApp(FIREBASE_CONFIG);
    const a = auth.getAuth(app);
    const db = store.getFirestore(app);

    /* Přihlášení přežije zavření prohlížeče. Bez tohohle by se člověk
       hlásil při každém otevření appky, což je u nástroje, který se
       otevírá jednou denně, to samé jako nemít sync vůbec. */
    await auth.setPersistence(a, auth.browserLocalPersistence);

    window.FB = {
      signIn: () => auth.signInWithPopup(a, new auth.GoogleAuthProvider()),
      signOut: () => auth.signOut(a),
      onUser: cb => auth.onAuthStateChanged(a, cb),
      read: async uid => {
        const snap = await store.getDoc(store.doc(db, "users", uid));
        return snap.exists() ? snap.data() : null;
      },
      write: (uid, data) =>
        store.setDoc(store.doc(db, "users", uid), data, {merge: true}),

      /* Zamrazená H2H kola. Na rozdíl od users/{uid} je tohle sdílené:
         losování je vlastnost ligy, ne jednoho člověka. Zapisuje ten,
         kdo se na dohrané kolo podívá první; ostatní už jen čtou.

         create bez update v pravidlech znamená, že zápis je jednorázový
         — jakmile kolo jednou spadne dovnitř, nikdo (ani omylem, ani
         schválně) ho nepřepíše. */
      h2hRead: async lid => {
        const snap = await store.getDocs(
          store.collection(db, "leagues", String(lid), "h2h"));
        const out = {};
        snap.forEach(d => { out[d.id] = d.data(); });
        return out;
      },
      h2hFreeze: (lid, gw, data) =>
        store.setDoc(store.doc(db, "leagues", String(lid), "h2h", String(gw)),
                     data),
    };
  }catch(e){
    // Bez sync appka funguje dál. Hlásit to na stránce nemá cenu —
    // jediný, koho to zajímá, je ten, kdo config vyplňoval.
    console.warn("Firebase se nepodařilo načíst:", e);
  }
}

// I když se Firebase nenačte, hlavní skript musí vědět, že už na nic
// nečeká — jinak by tlačítko Přihlásit zůstalo viset v „Načítám“.
window.dispatchEvent(new Event("fb-ready"));
