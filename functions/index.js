
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

initializeApp();

const ADMIN_UID = "G88cofmUeuMxAU8zXVOeoKyjx8n1";

function checkAdmin(request) {
  if (!request.auth || request.auth.uid !== ADMIN_UID) {
    throw new HttpsError("permission-denied", "Only admin allowed");
  }
}

exports.createAgent = onCall({region:"us-central1"}, async (request) => {
  checkAdmin(request);

  const name = String(request.data.name || "").trim();
  const email = String(request.data.email || "").trim().toLowerCase();
  const password = String(request.data.password || "");

  if (!name || name.length > 60 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 12) {
    throw new HttpsError("invalid-argument", "Invalid agent details");
  }

  let user;
  try {
    user = await getAuth().createUser({
      email,
      password,
      displayName: name,
      disabled: false
    });

    await getFirestore().collection("agents").doc(user.uid).set({
      name,
      email,
      role: "agent",
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: request.auth.uid
    });

    return {success:true, uid:user.uid};
  } catch (error) {
    if (user) {
      await getAuth().deleteUser(user.uid).catch(() => {});
    }
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "Email already registered");
    }
    throw new HttpsError("internal", "Agent creation failed");
  }
});

exports.listAgents = onCall({region:"us-central1"}, async (request) => {
  checkAdmin(request);

  const snapshot = await getFirestore()
    .collection("agents")
    .limit(500)
    .get();

  const agents = snapshot.docs.map(doc => ({
    uid: doc.id,
    name: doc.data().name || "",
    email: doc.data().email || "",
    role: doc.data().role || "",
    active: doc.data().active === true
  }));

  return {agents};
});

exports.setAgentActive = onCall({region:"us-central1"}, async (request) => {
  checkAdmin(request);

  const uid = String(request.data.uid || "");
  const active = request.data.active;

  if (!uid || uid === ADMIN_UID || typeof active !== "boolean") {
    throw new HttpsError("invalid-argument", "Invalid request");
  }

  const ref = getFirestore().collection("agents").doc(uid);
  const snap = await ref.get();

  if (!snap.exists || snap.data().role !== "agent") {
    throw new HttpsError("not-found", "Agent not found");
  }

  await getAuth().updateUser(uid, {disabled: !active});
  await ref.update({active});

  return {success:true};
});
