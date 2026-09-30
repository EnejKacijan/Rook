// A live WebKit Firestore server read took 29.7 seconds in isolated QA.
// Allow one bounded cloud read without relaxing account/profile validation.
export const ACCOUNT_CLOUD_READ_TIMEOUT_MS = 45000;
