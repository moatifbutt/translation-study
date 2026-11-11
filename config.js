// ---------------------------------------------------------------------------
// Study configuration. This is the only file you normally need to edit.
// ---------------------------------------------------------------------------
window.STUDY_CONFIG = {
  // Google Apps Script web-app URL (see README.md, "Deploy").
  // While this is empty, nothing is uploaded and participants only get the
  // "download my answers" button. Useful for local testing.
  ENDPOINT_URL: "https://script.google.com/macros/s/AKfycbzJImB4k5uz3X_9fY9LZstuBl2EmKYVrnOIIyzZYJf1TTp6XDQar9Cuvw9S1BtG0s8/exec",

  // Stored with every row, so data from different versions can be told apart.
  // Keep it equal to study_id in trials.json; change both if the stimuli change.
  STUDY_ID: "cycledrift_v2",

  // Blank stage between two questions, in milliseconds.
  ISI_MS: 400,

  // Shown on the welcome page. Leave empty to hide.
  CONTACT: "",
};
