/**
 * Interviewer identity configuration.
 *
 * `image` should point at a licensed/owned portrait the project owner
 * supplies locally (e.g. `/assets/interviewer-avatar.jpg` in `public/`).
 * Nothing in this codebase fetches or scrapes a photo automatically — until
 * a real image is dropped in and referenced here, the avatar renders as the
 * abstract "neural core" instead of an empty/broken image.
 *
 * `mouthAnchor` calibrates where the speaking overlay sits on THAT specific
 * photo (as a percentage of the image box). Because there's no face-landmark
 * detection in this project, these numbers must be set by eye once a real
 * photo is added — defaults assume a fairly centered head-and-shoulders crop.
 */
export const interviewerProfile = {
  name: "Ava",
  role: "AI Technical Interviewer",
  // Set this to a real, licensed image path once available, e.g.
  image: "/assets/interviewer.jpg",
  //image: null,
  mouthAnchor: {
    xPercent: 50,
    yPercent: 68,
    widthPercent: 16,
  },
};
