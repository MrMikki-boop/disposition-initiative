const moduleName = "disposition-initiative";
const selectionGroupNumberFlag = "selectionGroupNumber";
const selectionGroupColorFlag = "selectionGroupColor";
const swapTargetFiltersSetting = "swapTargetFilters";
const groupColors = [
  "#c84c4c",
  "#3f7fc5",
  "#4f9d5d",
  "#c99a2e",
  "#8b62c7",
  "#c8649f",
  "#4aa6a6",
  "#d06f3c",
];
const defaultSwapTargetFilters = {
  players: true,
  friendly: true,
  neutral: true,
  hostile: true,
  secret: true,
};

import DispInit from "./DispInit.mjs";

let pendingSwapContextCombatantId = null;
let pendingSwapContextMenuObserver = null;

function getCombatant(combatantId) {
  return game.combat?.combatants?.get(combatantId);
}

function getGroupColor(groupNumber) {
  return groupColors[(Number(groupNumber) - 1) % groupColors.length];
}

function getDialogElement(html) {
  return html?.querySelector ? html : html?.[0];
}

function getHTMLElement(element) {
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  return element?.element ?? element;
}

function resolveCombatantId(value) {
  if (!value) return null;
  if (getCombatant(value)) return value;

  const normalized = String(value)
    .replace(/^combatant[-.]/, "")
    .replace(/^Combatant[-.]/, "")
    .replace(/^token[-.]/, "")
    .replace(/^Token[-.]/, "");
  if (getCombatant(normalized)) return normalized;

  return game.combat?.combatants?.find?.((combatant) => {
    return (
      combatant.token?.id === value ||
      combatant.token?.object?.id === value ||
      combatant.tokenId === value ||
      combatant.actor?.id === value
    );
  })?.id;
}

function getCombatantIdFromElement(element) {
  const root = getHTMLElement(element);
  if (!root?.closest) return null;

  const row = root.closest(
    [
      "[data-combatant-id]",
      "[data-document-id]",
      "[data-entry-id]",
      "[data-token-id]",
      ".combatant",
    ].join(","),
  );
  if (!row) return null;

  for (const key of ["combatantId", "documentId", "entryId", "tokenId"]) {
    const combatantId = resolveCombatantId(row.dataset?.[key]);
    if (combatantId) return combatantId;
  }

  return resolveCombatantId(row.id);
}

function getCombatantIdFromEntry(entry) {
  return getCombatantIdFromElement(entry);
}

function normalizeSwapTargetFilters(filters) {
  return Object.fromEntries(
    Object.entries(defaultSwapTargetFilters).map(([key, defaultValue]) => [
      key,
      typeof filters?.[key] === "boolean" ? filters[key] : defaultValue,
    ]),
  );
}

function hasPlayerOwner(actor) {
  if (!actor) return false;
  if (typeof actor.hasPlayerOwner === "boolean") return actor.hasPlayerOwner;
  if (typeof actor.hasPlayerOwner === "function") return actor.hasPlayerOwner();
  return game.users?.some(
    (user) => !user.isGM && actor.testUserPermission?.(user, "OWNER"),
  );
}

function isPlayerCombatant(combatant) {
  const actor = combatant?.actor;
  if (!actor) return false;
  if (actor.type === "character") return true;
  if (combatant.players?.some?.((user) => !user.isGM)) return true;
  return hasPlayerOwner(actor);
}

function getCombatantDisposition(combatant) {
  return (
    combatant?.token?.disposition ??
    combatant?.token?.object?.document?.disposition ??
    combatant?.token?.object?.disposition ??
    CONST.TOKEN_DISPOSITIONS.NEUTRAL
  );
}

function getSwapTargetFilterKey(combatant) {
  if (isPlayerCombatant(combatant)) return "players";

  const disposition = getCombatantDisposition(combatant);
  if (disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) return "friendly";
  if (disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) return "hostile";
  if (disposition === CONST.TOKEN_DISPOSITIONS.SECRET) return "secret";
  return "neutral";
}

function getSwapTargetFilterOptions(filters) {
  return [
    ["players", "fa-solid fa-user", "DispInit.SwapInitiative.Filter.Players"],
    [
      "friendly",
      "fa-solid fa-shield-heart",
      "DispInit.SwapInitiative.Filter.Friendly",
    ],
    [
      "neutral",
      "fa-solid fa-scale-balanced",
      "DispInit.SwapInitiative.Filter.Neutral",
    ],
    ["hostile", "fa-solid fa-skull", "DispInit.SwapInitiative.Filter.Hostile"],
    [
      "secret",
      "fa-solid fa-user-secret",
      "DispInit.SwapInitiative.Filter.Secret",
    ],
  ]
    .map(([key, icon, label]) => {
      return `
        <label class="disposition-initiative-swap-filter">
          <input type="checkbox" data-swap-filter="${key}"${filters[key] ? " checked" : ""}>
          <i class="${icon}"></i>
          <span>${game.i18n.localize(label)}</span>
        </label>
      `;
    })
    .join("");
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getCombatantImage(combatant) {
  return (
    combatant?.img ??
    combatant?.token?.texture?.src ??
    combatant?.token?.object?.texture?.src ??
    combatant?.actor?.img ??
    "icons/svg/mystery-man.svg"
  );
}

function hasStatus(combatant, statuses) {
  const actor = combatant?.actor ?? combatant?.token?.actor;
  const token = combatant?.token?.object ?? combatant?.token;
  const actorStatuses = actor?.statuses ?? new Set();
  const tokenStatuses = token?.statuses ?? new Set();

  for (const status of statuses) {
    if (actorStatuses.has?.(status) || tokenStatuses.has?.(status)) return true;
  }

  return actor?.effects?.some((effect) =>
    statuses.some((status) => effect.statuses?.has?.(status)),
  );
}

function isIncapacitated(combatant) {
  return hasStatus(combatant, [
    "incapacitated",
    "unconscious",
    "paralyzed",
    "petrified",
    "stunned",
  ]);
}

async function swapInitiative(sourceId, targetId) {
  const source = getCombatant(sourceId);
  const target = getCombatant(targetId);

  if (!source || !target || source.id === target.id) return;
  if (source.initiative === null || target.initiative === null) {
    ui.notifications.warn("DispInit.Warn.SwapRequiresInitiative", {
      localize: true,
    });
    return;
  }

  if (isIncapacitated(source) || isIncapacitated(target)) {
    ui.notifications.warn("DispInit.Warn.SwapIncapacitated", {
      localize: true,
    });
    return;
  }

  await game.combat.updateEmbeddedDocuments("Combatant", [
    { _id: source.id, initiative: target.initiative },
    { _id: target.id, initiative: source.initiative },
  ]);
}

function openSwapInitiativeDialog(sourceId) {
  const source = getCombatant(sourceId);
  if (!source) return;

  const targets = game.combat.combatants
    .filter((combatant) => combatant.id !== source.id)
    .filter((combatant) => combatant.initiative !== null);

  if (!targets.length) {
    ui.notifications.warn("DispInit.Warn.NoSwapTargets", { localize: true });
    return;
  }

  const dialogId = `disposition-initiative-swap-${source.id}-${Date.now()}`;
  let filters = normalizeSwapTargetFilters(
    game.settings.get(moduleName, swapTargetFiltersSetting),
  );
  let selectedTargetId = null;
  const selectionInputName = `disposition-initiative-swap-${source.id}`;
  const getVisibleTargets = () =>
    targets.filter((combatant) => filters[getSwapTargetFilterKey(combatant)]);
  const ensureSelectedTarget = () => {
    const selectedTargetVisible = targets.some(
      (combatant) =>
        combatant.id === selectedTargetId &&
        filters[getSwapTargetFilterKey(combatant)] &&
        !isIncapacitated(combatant),
    );
    if (selectedTargetVisible) return;

    selectedTargetId =
      getVisibleTargets().find((combatant) => !isIncapacitated(combatant))
        ?.id ?? null;
  };
  const buildTargetRows = () => {
    ensureSelectedTarget();
    const rows = targets
      .map((combatant) => {
        const disabled = isIncapacitated(combatant);
        const checked = combatant.id === selectedTargetId;
        const filterKey = getSwapTargetFilterKey(combatant);
        const hidden = filters[filterKey] ? "" : " hidden";
        const name = escapeHTML(combatant.name);
        const initiative = combatant.initiative ?? "-";
        const classes = [
          "disposition-initiative-swap-target",
          disabled ? "disabled" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `
          <label class="${classes}" data-swap-target-row data-filter-key="${filterKey}"${hidden}>
            <input type="radio" name="${selectionInputName}" value="${combatant.id}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}>
            <img src="${escapeHTML(getCombatantImage(combatant))}" alt="">
            <span class="disposition-initiative-swap-target-name">${name}</span>
            <span class="disposition-initiative-swap-target-value">${initiative}</span>
          </label>
        `;
      })
      .join("");
    const emptyHidden = getVisibleTargets().length ? " hidden" : "";
    return `${rows}<div class="disposition-initiative-swap-empty"${emptyHidden}>${game.i18n.localize("DispInit.SwapInitiative.NoFilteredTargets")}</div>`;
  };

  const content = `
    <div class="disposition-initiative-swap-dialog" data-swap-dialog-id="${dialogId}">
      <div class="disposition-initiative-swap-source">
        <img src="${escapeHTML(getCombatantImage(source))}" alt="">
        <div class="disposition-initiative-swap-source-text">
          <strong>${escapeHTML(source.name)}</strong>
          <span>${source.initiative ?? "-"}</span>
        </div>
      </div>
      <div class="disposition-initiative-swap-filters">
        ${getSwapTargetFilterOptions(filters)}
      </div>
      <div class="disposition-initiative-swap-targets">
        <label class="disposition-initiative-swap-targets-label">
          ${game.i18n.localize("DispInit.SwapInitiative.Target")}
        </label>
        <div class="disposition-initiative-swap-target-list">
          ${buildTargetRows()}
        </div>
      </div>
    </div>
  `;
  const applyFiltersToDialog = (root) => {
    const visibleFilters = new Set(
      Object.entries(filters)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key),
    );

    for (const input of root.querySelectorAll("[data-swap-filter]")) {
      input.checked = Boolean(filters[input.dataset.swapFilter]);
    }

    let hasVisibleTarget = false;
    for (const row of root.querySelectorAll("[data-swap-target-row]")) {
      const visible = visibleFilters.has(row.dataset.filterKey);
      row.hidden = !visible;
      if (visible) hasVisibleTarget = true;
    }

    const selectedInput = root.querySelector(
      `[name="${selectionInputName}"]:checked`,
    );
    if (
      !selectedInput ||
      selectedInput.disabled ||
      selectedInput.closest("[data-swap-target-row]")?.hidden
    ) {
      const nextInput = root.querySelector(
        `[data-swap-target-row]:not([hidden]) [name="${selectionInputName}"]:not(:disabled)`,
      );
      if (nextInput) {
        nextInput.checked = true;
        selectedTargetId = nextInput.value;
      } else {
        selectedTargetId = null;
      }
    }

    const empty = root.querySelector(".disposition-initiative-swap-empty");
    if (empty) empty.hidden = hasVisibleTarget;
  };
  const bindSwapDialogControls = (root) => {
    if (root.dataset.swapControlsBound) return;
    root.dataset.swapControlsBound = "true";
    root.addEventListener("change", (event) => {
      const input = event.target;
      if (input?.name === selectionInputName && input.checked) {
        selectedTargetId = input.value;
        return;
      }

      if (!input?.matches?.("[data-swap-filter]")) return;

      filters = normalizeSwapTargetFilters({
        ...filters,
        [input.dataset.swapFilter]: input.checked,
      });
      void game.settings.set(moduleName, swapTargetFiltersSetting, filters);
      applyFiltersToDialog(root);
    });
    applyFiltersToDialog(root);
  };
  const attachSwapDialogControls = () => {
    const root = document.querySelector(`[data-swap-dialog-id="${dialogId}"]`);
    if (root) bindSwapDialogControls(root);
  };
  const scheduleSwapDialogControls = () => {
    requestAnimationFrame(attachSwapDialogControls);
    setTimeout(attachSwapDialogControls, 0);
    setTimeout(attachSwapDialogControls, 50);
    setTimeout(attachSwapDialogControls, 150);
    const observer = new MutationObserver(() => {
      const root = document.querySelector(`[data-swap-dialog-id="${dialogId}"]`);
      if (!root) return;
      bindSwapDialogControls(root);
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 2000);
  };
  const onSwap = () => {
    const targetValid = targets.some(
      (combatant) =>
        combatant.id === selectedTargetId &&
        filters[getSwapTargetFilterKey(combatant)] &&
        !isIncapacitated(combatant),
    );
    if (targetValid) {
      swapInitiative(source.id, selectedTargetId);
    } else {
      ui.notifications.warn("DispInit.Warn.NoSwapTargets", {
        localize: true,
      });
    }
  };
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2) {
    void new DialogV2({
      window: {
        title: game.i18n.localize("DispInit.SwapInitiative.Title"),
      },
      position: {
        width: 460,
        height: "auto",
      },
      content,
      buttons: [
        {
          action: "swap",
          icon: "fa-solid fa-right-left",
          label: game.i18n.localize("DispInit.SwapInitiative.Confirm"),
          default: true,
          callback: onSwap,
        },
        {
          action: "cancel",
          icon: "fa-solid fa-xmark",
          label: game.i18n.localize("DispInit.SwapInitiative.Cancel"),
        },
      ],
    }).render(true);
    scheduleSwapDialogControls();
    return;
  }

  const dialog = new Dialog({
    title: game.i18n.localize("DispInit.SwapInitiative.Title"),
    content,
    buttons: {
      swap: {
        icon: '<i class="fa-solid fa-right-left"></i>',
        label: game.i18n.localize("DispInit.SwapInitiative.Confirm"),
        callback: (html) => {
          const element = getDialogElement(html);
          const targetId = element?.querySelector(
            `[name="${selectionInputName}"]:checked`,
          )?.value;
          if (targetId) {
            swapInitiative(source.id, targetId);
          } else {
            ui.notifications.warn("DispInit.Warn.NoSwapTargets", {
              localize: true,
            });
          }
        },
      },
      cancel: {
        label: game.i18n.localize("DispInit.SwapInitiative.Cancel"),
      },
    },
    default: "swap",
  });
  dialog.render(true);
  scheduleSwapDialogControls();
}

function expandContextMenu(menu) {
  menu.classList.add("disposition-initiative-expanded-context");
  const list = menu.querySelector(".context-items, ol, ul") ?? menu;

  const applySizing = () => {
    const margin = 8;
    const maxHeight = Math.max(160, window.innerHeight - margin * 2);
    const menuExtraHeight = Math.max(0, menu.offsetHeight - list.offsetHeight);
    const desiredListHeight = list.scrollHeight;
    const desiredMenuHeight = desiredListHeight + menuExtraHeight;
    const canShowAll = desiredMenuHeight <= maxHeight;
    const listHeight = canShowAll
      ? desiredListHeight
      : Math.max(120, maxHeight - menuExtraHeight);
    const menuHeight = listHeight + menuExtraHeight;

    list.style.setProperty("height", `${listHeight}px`, "important");
    list.style.setProperty("max-height", `${listHeight}px`, "important");
    list.style.setProperty(
      "overflow",
      canShowAll ? "visible" : "hidden",
      "important",
    );
    list.style.setProperty(
      "overflow-y",
      canShowAll ? "visible" : "auto",
      "important",
    );
    menu.style.setProperty("height", `${menuHeight}px`, "important");
    menu.style.setProperty("max-height", `${menuHeight}px`, "important");
    menu.style.setProperty("overflow", "visible", "important");
    menu.style.setProperty("overflow-y", "visible", "important");

    const rect = menu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - margin) {
      const top = Math.max(margin, window.innerHeight - rect.height - margin);
      menu.style.setProperty("top", `${top}px`, "important");
    }
    if (rect.right > window.innerWidth - margin) {
      const left = Math.max(margin, window.innerWidth - rect.width - margin);
      menu.style.setProperty("left", `${left}px`, "important");
    }
  };

  applySizing();
  requestAnimationFrame(applySizing);
  setTimeout(applySizing, 50);
}

function injectSwapContextMenuItem(combatantId) {
  const combatant = getCombatant(combatantId);
  if (!game.user.isGM || !combatant || combatant.initiative === null) return;

  const menu = document.querySelector("#context-menu");
  const list = menu?.querySelector(".context-items, ol, ul") ?? menu;
  if (!menu || !list) return;
  if (list.querySelector(".disposition-initiative-swap-context")) {
    expandContextMenu(menu);
    return;
  }

  expandContextMenu(menu);
  const itemTag = list.querySelector(".context-item")?.tagName ?? "li";
  const item = document.createElement(itemTag);
  item.className = "context-item disposition-initiative-swap-context";
  item.dataset.action = "disposition-initiative-swap";
  item.innerHTML = `<i class="fa-solid fa-right-left"></i><span>${game.i18n.localize(
    "DispInit.SwapInitiative.Context",
  )}</span>`;
  item.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    menu.remove();
    openSwapInitiativeDialog(combatant.id);
  });

  list.append(item);
  expandContextMenu(menu);
  pendingSwapContextCombatantId = null;
  pendingSwapContextMenuObserver?.disconnect();
  pendingSwapContextMenuObserver = null;
}

function scheduleSwapContextMenuInjection(combatantId) {
  pendingSwapContextCombatantId = combatantId;
  pendingSwapContextMenuObserver?.disconnect();

  requestAnimationFrame(() => injectSwapContextMenuItem(combatantId));
  setTimeout(() => injectSwapContextMenuItem(combatantId), 0);
  setTimeout(() => injectSwapContextMenuItem(combatantId), 50);

  pendingSwapContextMenuObserver = new MutationObserver(() => {
    if (pendingSwapContextCombatantId) {
      injectSwapContextMenuItem(pendingSwapContextCombatantId);
    }
  });
  pendingSwapContextMenuObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  setTimeout(() => {
    if (pendingSwapContextCombatantId === combatantId) {
      pendingSwapContextCombatantId = null;
      pendingSwapContextMenuObserver?.disconnect();
      pendingSwapContextMenuObserver = null;
    }
  }, 2000);
}

function installSwapContextMenuFallback() {
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (!game.user.isGM) return;
      const combatantId = getCombatantIdFromElement(event.target);
      if (!combatantId) {
        pendingSwapContextCombatantId = null;
        pendingSwapContextMenuObserver?.disconnect();
        pendingSwapContextMenuObserver = null;
        return;
      }
      scheduleSwapContextMenuInjection(combatantId);
    },
    true,
  );
}

function renderGroupBadges(html) {
  const combat = game.combat;
  if (!combat) return;

  html
    .querySelectorAll(".disposition-initiative-group-badge")
    .forEach((badge) => badge.remove());

  if (game.settings.get(moduleName, "groupingMode") !== "selection") return;

  for (const combatant of combat.combatants) {
    const groupNumber = combatant.getFlag(
      moduleName,
      selectionGroupNumberFlag,
    );
    if (!groupNumber) continue;

    const groupColor =
      combatant.getFlag(moduleName, selectionGroupColorFlag) ??
      getGroupColor(groupNumber) ??
      "#777";
    const row = html.querySelector(`[data-combatant-id="${combatant.id}"]`);
    if (!row) continue;

    const name =
      row.querySelector(".token-name h4") ??
      row.querySelector(".token-name") ??
      row.querySelector(".name") ??
      row;
    const badge = document.createElement("span");
    badge.className = "disposition-initiative-group-badge";
    badge.style.setProperty("--disposition-initiative-group-color", groupColor);
    badge.dataset.tooltip = game.i18n.format("DispInit.GroupBadgeTooltip", {
      group: groupNumber,
    });
    badge.textContent = game.i18n.format("DispInit.GroupBadge", {
      group: groupNumber,
    });
    name.append(badge);
  }
}

Hooks.once("init", async function () {
  // Load API
  let dispInit = new DispInit();
  window.game.dispInit = dispInit;

  // --------------------------------------------------
  // KEYBINDINGS
  game.keybindings.register(moduleName, "disposition-initiative_keybinding", {
    name: "Disposition Initiative",
    hint: "This will trigger the Disposition Initiative.",
    editable: [{ key: "KeyG", modifiers: [] }],
    onDown: () => {
      const activeCombatHasStarted = game.combats.find(
        (combat) => combat.active && combat.started,
      );
      if (!activeCombatHasStarted) {
        window.game.dispInit.groupInitiative();
      }
    },
    onUp: () => {},
    restricted: true, // Restrict this Keybinding to gamemaster only?
    reservedModifiers: [],
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.settings.register(moduleName, "initiativeTieBreak", {
    name: "DispInit.Settings.InitiativeTiebreak",
    hint: "DispInit.Settings.InitiativeTiebreakHint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(moduleName, swapTargetFiltersSetting, {
    scope: "client",
    config: false,
    type: Object,
    default: defaultSwapTargetFilters,
  });

  game.settings.register(moduleName, "initiativeRollMode", {
    name: "DispInit.Settings.InitiativeRollMode",
    hint: "DispInit.Settings.InitiativeRollModeHint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    choices: {
      roll: "DispInit.Settings.InitiativeRollModeChoices.Roll",
      passive: "DispInit.Settings.InitiativeRollModeChoices.Passive",
      passiveNPCs: "DispInit.Settings.InitiativeRollModeChoices.PassiveNPCs",
    },
    default: "roll",
  });

  game.settings.register(moduleName, "groupingMode", {
    name: "DispInit.Settings.GroupingMode",
    hint: "DispInit.Settings.GroupingModeHint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    choices: {
      selection: "DispInit.Settings.GroupingModeChoices.Selection",
      disposition: "DispInit.Settings.GroupingModeChoices.Disposition",
      sameActor: "DispInit.Settings.GroupingModeChoices.SameActor",
    },
    default: "selection",
  });

  game.settings.register(moduleName, "groupPlayersToFriendlyTokens", {
    name: "DispInit.Settings.GroupPlayersToFriendlyTokens",
    hint: "DispInit.Settings.GroupPlayersToFriendlyTokensHint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(moduleName, "rerollInitiativeEveryRound", {
    name: "DispInit.Settings.RerollInitiativeEveryRound",
    hint: "DispInit.Settings.RerollInitiativeEveryRoundHint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  });
});

Hooks.on("getSceneControlButtons", function (controls) {
  if (game.user.isGM) {
    controls.tokens.tools["disposition-initiative_button"] = {
      icon: "fa-solid fa-people-group",
      name: "disposition-initiative_button",
      title: "DispInit.GroupInitiative",
      button: true,
      onChange: (event, active) => {
        if (active) window.game.dispInit.groupInitiative();
      },
    };
  }
});

Hooks.on("renderCombatTracker", (app, html) => {
  if (!game.user.isGM) return;

  const selector = html.querySelector(
    "#combat > header > div > div.control-buttons.left.flexrow > button.inline-control.combat-control.icon.fa-solid.fa-users",
  );
  const controls =
    selector?.parentElement ??
    html.querySelector("#combat header .control-buttons.left");
  const buttons = `<button
      data-tooltip="DispInit.ClearGroups"
      class="clear-initiative-groups inline-control combat-control icon fa-solid fa-eraser">
    </button>
    <button
      data-tooltip="DispInit.GroupInitiative"
      class="group-initiative inline-control combat-control icon fa-solid fa-people-group">
    </button>`;

  if (selector) {
    selector.insertAdjacentHTML("beforebegin", buttons);
  } else {
    controls?.insertAdjacentHTML("beforeend", buttons);
  }

  html.querySelector(".group-initiative")?.addEventListener("click", () => {
    window.game.dispInit.groupInitiative();
  });
  html
    .querySelector(".clear-initiative-groups")
    ?.addEventListener("click", () => {
      window.game.dispInit.clearSelectionGroups();
    });

  renderGroupBadges(html);
});

Hooks.on("updateCombat", async (combat, update) => {
  if (!game.user.isGM) return;

  if (update && update.round && update.round > 1) {
    const reroll = game.settings.get(moduleName, "rerollInitiativeEveryRound");
    if (reroll) window.game.dispInit.groupInitiative({ reroll: true });
  }
});

Hooks.once("ready", async function () {
  installSwapContextMenuFallback();
});
