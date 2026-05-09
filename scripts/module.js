const moduleName = "disposition-initiative";
const selectionGroupNumberFlag = "selectionGroupNumber";
const selectionGroupColorFlag = "selectionGroupColor";
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

import DispInit from "./DispInit.mjs";

function getGroupColor(groupNumber) {
  return groupColors[(Number(groupNumber) - 1) % groupColors.length];
}

function renderGroupBadges(html) {
  const combat = game.combat;
  if (!combat) return;

  html
    .querySelectorAll(".disposition-initiative-group-badge")
    .forEach((badge) => badge.remove());

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

Hooks.once("ready", async function () {});
