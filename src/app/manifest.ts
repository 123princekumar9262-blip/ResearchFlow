import type { MetadataRoute } from "next";

/**
 * Installable on phones and desktops: opens straight to today's dashboard,
 * full screen, with shortcuts for the two things people do most.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ResearchFlow",
    short_name: "ResearchFlow",
    description: "Deadlines with owners, progress with proof. Project accountability for research students and their professors.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#fbfbfa",
    theme_color: "#4f46e5",
    lang: "en",
    dir: "ltr",
    categories: ["productivity", "education"],
    prefer_related_applications: false,
    icons: [
      { src: "/pwa-icon/192?purpose=any", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512?purpose=any", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Shown in the install dialog on Android and desktop Chrome.
    screenshots: [
      { src: "/screenshots/today-wide.png", sizes: "1280x800", type: "image/png", form_factor: "wide", label: "Today: the next action, what's overdue and your professor's feedback" },
      { src: "/screenshots/students-wide.png", sizes: "1280x800", type: "image/png", form_factor: "wide", label: "Professors see every student sorted by who needs attention" },
      { src: "/screenshots/today-narrow.png", sizes: "390x844", type: "image/png", form_factor: "narrow", label: "Today on your phone" },
      { src: "/screenshots/log-narrow.png", sizes: "390x844", type: "image/png", form_factor: "narrow", label: "Log today's progress in a minute" },
    ],
    shortcuts: [
      { name: "Write today's log", short_name: "Log", url: "/log/new", icons: [{ src: "/pwa-icon/192?purpose=any", sizes: "192x192" }] },
      { name: "My tasks", short_name: "Tasks", url: "/tasks", icons: [{ src: "/pwa-icon/192?purpose=any", sizes: "192x192" }] },
    ],
  };
}
