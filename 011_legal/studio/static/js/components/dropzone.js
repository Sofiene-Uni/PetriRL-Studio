// Drag-and-drop file zone (also click and keyboard to browse).
import { h, icons } from "../core/dom.js";

export function dropZone({ accept, multiple = true, title, hint, onFiles, slim = false }) {
  const input = h("input", { type: "file", accept, multiple, class: "hidden" });
  const zone = h("div", { class: slim ? "drop slim" : "drop", tabindex: 0, role: "button", "aria-label": title },
    h("span", { class: "drop-icon", html: icons.upload }), h("strong", {}, title), h("span", {}, hint), input);
  const send = (files) => files.length && onFiles([...files]);
  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.click()));
  input.addEventListener("change", () => { send(input.files); input.value = ""; });
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("over"); send(e.dataTransfer.files); });
  return zone;
}
