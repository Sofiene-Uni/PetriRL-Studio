// Multi-select dropdown with groups, search, size badges and per-item actions.
//   groups(): [{ title, bulk, items: [{ id, label, meta, search, badge, tag, tagKind, muted, removable }] }]
//   bulk: the group header gets a "select all" / "clear" toggle (e.g. a whole benchmark family).
//   selected: Set of ids (changed in place), onChange(), onRemove(item) for removable items.
import { h, icons } from "../core/dom.js";

export function multiSelect({ placeholder, groups, selected, onChange, onRemove = null, searchHint = "Search" }) {
  let open = false, query = "";
  const chips = h("div", { class: "ms-chips" });
  const caret = h("span", { class: "ms-caret", "aria-hidden": "true" });
  const trigger = h("button", { type: "button", class: "ms-trigger", "aria-haspopup": "listbox", "aria-expanded": "false" }, chips, caret);
  const search = h("input", { class: "ms-search", type: "search", placeholder: searchHint, "aria-label": searchHint });
  const list = h("div", { class: "ms-list", role: "listbox", "aria-multiselectable": "true" });
  const footer = h("div", { class: "ms-foot" });
  const panel = h("div", { class: "ms-panel hidden" }, search, list, footer);
  const root = h("div", { class: "ms" }, trigger, panel);

  const allItems = () => groups().flatMap((g) => g.items);

  const renderChips = () => {
    const items = allItems().filter((i) => selected.has(i.id));
    chips.replaceChildren();
    if (!items.length) { chips.append(h("span", { class: "ms-placeholder" }, placeholder)); return; }
    const shown = items.slice(0, 4);
    for (const it of shown) {
      chips.append(h("span", { class: `ms-chip${it.muted ? " muted" : ""}` }, it.label,
        it.badge ? h("small", {}, it.badge) : null,
        h("span", { class: "ms-x", role: "button", "aria-label": `Remove ${it.label}`, onclick: (e) => {
          e.stopPropagation(); selected.delete(it.id); update();
        } }, "×")));
    }
    if (items.length > shown.length) chips.append(h("span", { class: "ms-more" }, `+${items.length - shown.length}`));
  };

  const renderList = () => {
    list.replaceChildren();
    const q = query.trim().toLowerCase();
    let count = 0;
    for (const g of groups()) {
      const items = g.items.filter((i) => !q || `${i.label} ${i.meta || ""} ${i.badge || ""} ${i.search || ""} ${g.title}`.toLowerCase().includes(q));
      if (!items.length) continue;
      const allOn = items.every((i) => selected.has(i.id));
      list.append(h("div", { class: "ms-group" }, h("span", {}, g.title, h("small", {}, ` ${items.length}`)),
        g.bulk ? h("button", { type: "button", class: "ms-bulk", onclick: () => {
          items.forEach((i) => (allOn ? selected.delete(i.id) : selected.add(i.id)));
          update();
        } }, allOn ? "Clear" : `Select ${items.length === 1 ? "" : "all "}${items.length}`) : null));
      for (const it of items) {
        count++;
        const on = selected.has(it.id);
        list.append(h("div", { class: `ms-opt${on ? " on" : ""}${it.muted ? " muted" : ""}`, role: "option", "aria-selected": on, tabindex: 0,
          "data-id": it.id,
          onclick: () => { on ? selected.delete(it.id) : selected.add(it.id); update(); },
          onkeydown: (e) => {
            if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.currentTarget.click(); }
            if (e.key === "ArrowDown") { e.preventDefault(); focusNext(e.currentTarget, 1); }
            if (e.key === "ArrowUp") { e.preventDefault(); focusNext(e.currentTarget, -1); }
          } },
          h("span", { class: "tick" }),
          h("span", { class: "ms-text" }, h("span", { class: "ms-label" }, it.label), it.meta ? h("span", { class: "ms-meta" }, it.meta) : null),
          it.tag ? h("span", { class: `chip ${it.tagKind || ""}` }, it.tag) : h("span"),
          it.badge ? h("span", { class: "size" }, it.badge) : h("span"),
          it.removable && onRemove ? h("button", { type: "button", class: "icon-btn", title: `Delete ${it.label}`, html: icons.trash,
            onclick: async (e) => { e.stopPropagation(); await onRemove(it); update(); } }) : h("span")));
      }
    }
    if (!count) list.append(h("div", { class: "ms-none" }, q ? `Nothing matches "${query}"` : "Nothing here yet"));
    const n = selected.size;
    footer.replaceChildren(h("span", {}, `${n} selected`),
      h("span", { class: "ms-foot-actions" },
        n ? h("button", { type: "button", class: "btn small ghost", onclick: () => { selected.clear(); update(); } }, "Clear") : null,
        h("button", { type: "button", class: "btn small dark", onclick: () => setOpen(false) }, "Done")));
  };

  const focusNext = (el, dir) => {
    const opts = [...list.querySelectorAll(".ms-opt")];
    opts[Math.max(0, Math.min(opts.length - 1, opts.indexOf(el) + dir))]?.focus();
  };

  const update = () => {
    const focused = document.activeElement?.closest?.(".ms-opt")?.dataset.id;
    renderChips();
    if (open) {
      renderList();
      if (focused) list.querySelector(`.ms-opt[data-id="${CSS.escape(focused)}"]`)?.focus();
    }
    onChange?.();
  };

  const setOpen = (v) => {
    open = v;
    panel.classList.toggle("hidden", !v);
    root.classList.toggle("open", v);
    trigger.setAttribute("aria-expanded", String(v));
    if (v) { renderList(); search.focus(); }
  };

  trigger.addEventListener("click", () => setOpen(!open));
  search.addEventListener("input", () => { query = search.value; renderList(); });
  search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); list.querySelector(".ms-opt")?.focus(); }
  });
  const outside = (e) => { if (open && !root.contains(e.target)) setOpen(false); };
  const escape = (e) => { if (e.key === "Escape" && open) { setOpen(false); trigger.focus(); } };
  document.addEventListener("pointerdown", outside);
  document.addEventListener("keydown", escape);

  renderChips();
  return { el: root, render: () => { renderChips(); if (open) renderList(); }, close: () => setOpen(false),
    destroy: () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); } };
}
