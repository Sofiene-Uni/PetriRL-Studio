// Content pages (About, Contact, ...): the HTML is in studio/templates/pages/<lang>/<name>.html.
// A new page = a template per language + one line in ROUTES (main.js) + a link in partials/topbar.html.
import { contentPage } from "../core/i18n.js";

export const contentView = (name) => async (root) => {
  const ssr = root.querySelector(`[data-ssr="${name}"]`);          // already in the HTML (served at /<name>)
  const page = ssr || await contentPage(name);
  page.className = "content-page";
  if (!ssr) root.replaceChildren(page);
  // in-page links (#t-...) scroll; the hash itself belongs to the router
  page.querySelectorAll('a[href^="#"]:not([href^="#/"])').forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    page.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth" });
  }));
};
