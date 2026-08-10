import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  initializeAuth,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  push,
  remove,
  onValue,
  query,
  orderByChild,
  limitToLast
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);

// Define uma cadeia de persistência compatível com iPhone/iPad.
// Se o armazenamento local estiver indisponível, o Firebase tenta
// a sessão e, por último, mantém a autenticação somente em memória.
const auth = initializeAuth(app, {
  persistence: [
    browserLocalPersistence,
    browserSessionPersistence,
    inMemoryPersistence
  ]
});
const db = getDatabase(app);

function signInWithEmailAndPassword(authInstance, email, password) {
  const timeout = new Promise((_, reject) => {
    window.setTimeout(() => {
      const error = new Error(
        "A conexão com o login demorou demais. Verifique a internet e tente novamente."
      );
      error.code = "auth/timeout";
      reject(error);
    }, 15000);
  });

  return Promise.race([
    firebaseSignInWithEmailAndPassword(authInstance, email, password),
    timeout
  ]);
}

export {
  app, auth, db,
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  ref, get, set, update, push, remove, onValue, query, orderByChild, limitToLast
};
