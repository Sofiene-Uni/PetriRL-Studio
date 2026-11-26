// Multi-select dropdown with groups, search, size badges and per-item actions.
//   groups(): [{ title, meta, bulk, items: [{ id, label, meta, search, badge, tag, tagKind, muted, removable }] }]
//   bulk: the group header gets a "select all" / "clear" toggle (e.g. a whole benchmark family).
//   browse: two steps, first the list of groups, then the items of the chosen group (search still looks everywhere).
//   selected: Set of ids (changed in place), onChange(), onRemove(item) for removable items.
import { h, icons } from "../core/dom.js";
import { t } from "../core/i18n.js";

export function multiSelect({ placeholder, groups, selected, onChange, onRemove = null, searchHint = t("Search"), browse = false }) {
  let open = false, query = "", openGroup = null;
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

  const keyNav = (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.currentTarget.click(); }
    if (e.key === "ArrowDown") { e.preventDefault(); focusNext(e.currentTarget, 1); }
    if (e.key === "ArrowUp") { e.preventDefault(); focusNext(e.currentTarget, -1); }
    if (e.key === "ArrowLeft" && browse && openGroup != null) { e.preventDefault(); showGroups(); }
  };

  const bulkButton = (items) => {
    const allOn = items.every((i) => selected.has(i.id));
    return h("button", { type: "button", class: "ms-bulk", onclick: (e) => {
      e.stopPropagation();
      items.forEach((i) => (allOn ? selected.delete(i.id) : selected.add(i.id)));
      update();
    } }, allOn ? "Clear" : `Select ${items.length === 1 ? "" : "all "}${items.length}`);
  };

  const groupHeader = (g, items) => h("div", { class: "ms-group" }, h("span", {}, g.title, h("small", {}, ` ${items.length}`)),
    g.bulk ? bulkButton(items) : null);

  const option = (it) => {
    const on = selected.has(it.id);
    return h("div", { class: `ms-opt${on ? " on" : ""}${it.muted ? " muted" : ""}`, role: "option", "aria-selected": on, tabindex: 0,
      "data-id": it.id, onclick: () => { on ? selected.delete(it.id) : selected.add(it.id); update(); }, onkeydown: keyNav },
      h("span", { class: "tick" }),
      h("span", { class: "ms-text" }, h("span", { class: "ms-label" }, it.label), it.meta ? h("span", { class: "ms-meta" }, it.meta) : null),
      it.tag ? h("span", { class: `chip ${it.tagKind || ""}` }, it.tag) : h("span"),
      it.badge ? h("span", { class: "size" }, it.badge) : h("span"),
      it.removable && onRemove ? h("button", { type: "button", class: "icon-btn", title: `Delete ${it.label}`, html: icons.trash,
        onclick: async (e) => { e.stopPropagation(); await onRemove(it); update(); } }) : h("span"));
  };

  // step 1 of browse: one row per group, with how many of its items are selected
  const groupRow = (g) => {
    const n = g.items.filter((i) => selected.has(i.id)).length;
    return h("div", { class: "ms-folder", role: "button", tabindex: 0, "data-group": g.title, onkeydown: keyNav,
      onclick: () => { openGroup = g.title; renderList(); list.querySelector(".ms-opt, .ms-back")?.focus(); } },
      h("span", { class: "ms-text" }, h("span", { class: "ms-label" }, g.title), g.meta ? h("span", { class: "ms-meta" }, g.meta) : null),
      n ? h("span", { class: "chip blue" }, t("{n} selected", { n })) : h("span"),
      h("span", { class: "size" }, g.items.length),
      h("span", { class: "ms-chevron", "aria-hidden": "true" }));
  };

  const showGroups = () => {
    const from = openGroup;
    openGroup = null;
    renderList();
    list.querySelector(`.ms-folder[data-group="${CSS.escape(from || "")}"]`)?.focus();
  };

  const renderList = () => {
    list.replaceChildren();
    const q = query.trim().toLowerCase();
    const all = groups().filter((g) => g.items.length);
    let count = 0;
    if (browse && !q && openGroup == null) {
      all.forEach((g) => list.append(groupRow(g)));
      count = all.length;
    } else {
      const shown = browse && !q ? all.filter((g) => g.title === openGroup) : all;
      if (browse && !q) {
        list.append(h("button", { type: "button", class: "ms-back", onclick: showGroups, onkeydown: keyNav }, t("All groups")));
      }
      for (const g of shown) {
        const items = g.items.filter((i) => !q || `${i.label} ${i.meta || ""} ${i.badge || ""} ${i.search || ""} ${g.title}`.toLowerCase().includes(q));
        if (!items.length) continue;
        list.append(groupHeader(g, items));
        for (const it of items) { count++; list.append(option(it)); }
      }
    }
    if (!count) list.append(h("div", { class: "ms-none" }, q ? `Nothing matches "${query}"` : t("Nothing here yet")));
    const n = selected.size;
    footer.replaceChildren(h("span", {}, t("{n} selected", { n })),
      h("span", { class: "ms-foot-actions" },
        n ? h("button", { type: "button", class: "btn small ghost", onclick: () => { selected.clear(); update(); } }, t("Clear")) : null,
        h("button", { type: "button", class: "btn small dark", onclick: () => setOpen(false) }, t("Done"))));
  };

  const focusNext = (el, dir) => {
    const opts = [...list.querySelectorAll(".ms-opt, .ms-folder, .ms-back")];
    opts[Math.max(0, Math.min(opts.length - 1, opts.indexOf(el) + dir))]?.focus();
  };

  const update = () => {
    const focused = document.activeElement?.closest?.(".ms-opt")?.dataset.id;   // keep focus on the clicked option
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
    if (e.key === "ArrowDown") { e.preventDefault(); list.querySelector(".ms-opt, .ms-folder, .ms-back")?.focus(); }
  });
  const outside = (e) => { if (open && !root.contains(e.target)) setOpen(false); };
  const escape = (e) => { if (e.key === "Escape" && open) { setOpen(false); trigger.focus(); } };
  document.addEventListener("pointerdown", outside);
  document.addEventListener("keydown", escape);

  renderChips();
  return { el: root, render: () => { renderChips(); if (open) renderList(); }, close: () => setOpen(false),
    destroy: () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); } };
}
