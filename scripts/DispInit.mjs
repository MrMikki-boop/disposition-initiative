const moduleName = "disposition-initiative";
const selectionGroupFlag = "selectionGroup";
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

function randomId() {
  return (
    globalThis.foundry?.utils?.randomID?.() ?? `${Date.now()}-${Math.random()}`
  );
}

function getGroupColor(groupNumber) {
  return groupColors[(groupNumber - 1) % groupColors.length];
}

/**
 * Return an array of unique decimals.
 * Keeps the original behavior and defaults.
 * @param {number} count
 * @returns {number[]}
 */
function getUniqueRandomDecimals(count = 5) {
  const decimals = [];

  for (let digit = 1; digit <= 9 && decimals.length < count; digit++) {
    decimals.push(digit / 10);
  }

  for (let digit = 1; decimals.length < count; digit++) {
    decimals.push(digit / 1000);
  }

  return decimals.sort(() => Math.random() - 0.5);
}

/**
 * Return an array of unique small decimals (0.01 to 0.09) for intra-group tie-breaking
 * @param {number} count - Number of tokens in the group
 * @returns {number[]}
 */
function getUniqueIntraGroupDecimals(count) {
  const precision = count <= 9 ? 100 : 10000;
  const availableDigits = [...Array(count).keys()].map((i) => i + 1);
  const shuffled = [...availableDigits].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((digit) => digit / precision);
}

/** Random pick from a non-empty array */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Ensure a token has a combatant (preserves original API usage) */
async function ensureCombatant(token) {
  if (!token.combatant) {
    await token.toggleCombatant();
  }
}

/** Safely add decimals without floating point precision issues */
function safeDecimalAdd(base, decimal1, decimal2 = 0) {
  const total =
    Math.round(base * 10000) +
    Math.round(decimal1 * 10000) +
    Math.round(decimal2 * 10000);
  return total / 10000;
}

export default class DispInit {
  async clearSelectionGroups() {
    if (!game.user.isGM || !game.combat) return;

    const updates = game.combat.combatants.map((combatant) => ({
      _id: combatant.id,
      [`flags.${moduleName}.${selectionGroupFlag}`]: null,
      [`flags.${moduleName}.${selectionGroupNumberFlag}`]: null,
      [`flags.${moduleName}.${selectionGroupColorFlag}`]: null,
    }));

    if (updates.length) {
      await game.combat.updateEmbeddedDocuments("Combatant", updates);
    }
  }

  async groupInitiative({ reroll = false } = {}) {
    if (!game.user.isGM) return;

    let tokens = [];
    const combats = game.combats.filter((combat) => combat.active);
    const canvasTokens = canvas.tokens.controlled.map(
      (token) => token.document,
    );
    const hasManualSelection = !reroll && canvasTokens.length > 0;

    if (combats && combats.length) {
      const combat = combats[0];
      const combatTokens = combat.combatants.map(
        (combatant) => combatant.token,
      );

      const alreadyRolled = combat.combatants.contents.every(
        (c) => c.initiative !== null,
      );

      if (alreadyRolled && !reroll && !hasManualSelection) return;

      tokens = [...combatTokens];
    }

    if (hasManualSelection || !tokens.length) {
      tokens = [...canvasTokens];
    }

    if (!tokens || !tokens.length) {
      return ui.notifications.warn("DispInit.Error.NoSelectedToken", {
        localize: true,
        permanent: true,
      });
    }

    const useInitiativeTiebreaking = game.settings.get(
      moduleName,
      "initiativeTieBreak",
    );

    const groupPlayersToFriendlyTokens = game.settings.get(
      moduleName,
      "groupPlayersToFriendlyTokens",
    );

    const buildDispositionGroups = (groupTokens) => {
      const groups = {
        players: [],
        friendly: [],
        neutral: [],
        hostile: [],
        secret: [],
      };

      const { FRIENDLY, NEUTRAL, HOSTILE, SECRET } = CONST.TOKEN_DISPOSITIONS;

      // Separate tokens into groups (preserving the original logic)
      for (const token of groupTokens) {
        if (token?.hasPlayerOwner === true) {
          if (groupPlayersToFriendlyTokens) {
            groups.friendly.push(token);
          } else {
            groups.players.push(token);
          }
        } else {
          const disp = token?.disposition;

          switch (disp) {
            case FRIENDLY:
              groups.friendly.push(token);
              break;
            case SECRET:
              groups.secret.push(token);
              break;
            case HOSTILE:
              groups.hostile.push(token);
              break;
            case NEUTRAL:
              groups.neutral.push(token);
              break;
            // no default: unhandled dispositions are ignored (same behavior)
          }
        }
      }

      return Object.entries(groups)
        .filter(([, group]) => group.length)
        .map(([id, group]) => ({ id, tokens: group }));
    };

    const getSelectionGroupId = (token) =>
      token?.combatant?.getFlag(moduleName, selectionGroupFlag);

    const getNextSelectionGroupNumber = () => {
      const combatants = game.combat?.combatants?.contents ?? [];
      const numbers = combatants
        .map((combatant) =>
          Number(combatant.getFlag(moduleName, selectionGroupNumberFlag)),
        )
        .filter(Number.isInteger);

      return numbers.length ? Math.max(...numbers) + 1 : 1;
    };

    const buildCombatGroups = () => {
      if (hasManualSelection) {
        const groupNumber = getNextSelectionGroupNumber();

        return [
          {
            id: randomId(),
            number: groupNumber,
            color: getGroupColor(groupNumber),
            persist: true,
            tokens,
          },
        ];
      }

      const selectionGroups = new Map();
      const dispositionTokens = [];

      for (const token of tokens) {
        const selectionGroupId = getSelectionGroupId(token);
        if (selectionGroupId) {
          if (!selectionGroups.has(selectionGroupId)) {
            selectionGroups.set(selectionGroupId, []);
          }
          selectionGroups.get(selectionGroupId).push(token);
        } else {
          dispositionTokens.push(token);
        }
      }

      return [
        ...Array.from(selectionGroups, ([id, group]) => ({
          id,
          number: Number(
            group[0]?.combatant?.getFlag(moduleName, selectionGroupNumberFlag),
          ),
          color: group[0]?.combatant?.getFlag(
            moduleName,
            selectionGroupColorFlag,
          ),
          tokens: group,
        })),
        ...buildDispositionGroups(dispositionTokens),
      ];
    };

    const combatGroups = buildCombatGroups();
    const groupTieBreakers = getUniqueRandomDecimals(combatGroups.length);

    // Process a token group with intra-group tie-breaking
    const processGroup = async (
      group,
      groupIndex,
      groupId,
      groupNumber,
      groupColor,
      persistGroup = false,
      useInitiativeTiebreaking = false,
    ) => {
      if (group.length === 0) return;

      const roller = pickRandom(group);
      await ensureCombatant(roller);

      await game.combat.rollInitiative([roller.combatant.id]);

      const baseInitiative = Math.floor(roller.combatant.initiative);

      const groupTieBreaker = useInitiativeTiebreaking
        ? groupTieBreakers[groupIndex]
        : 0;

      const intraGroupTieBreakers = getUniqueIntraGroupDecimals(group.length);

      const shuffledIntraBreakers = [...intraGroupTieBreakers].sort(
        () => Math.random() - 0.5,
      );

      for (let i = 0; i < group.length; i++) {
        const token = group[i];
        await ensureCombatant(token);

        let finalInitiative = baseInitiative;
        if (useInitiativeTiebreaking) {
          const rollerTieBreaker = shuffledIntraBreakers[i];
          finalInitiative = safeDecimalAdd(
            baseInitiative,
            groupTieBreaker,
            rollerTieBreaker,
          );
        }

        const update = { initiative: finalInitiative };
        if (persistGroup) {
          update[`flags.${moduleName}.${selectionGroupFlag}`] = groupId;
          update[`flags.${moduleName}.${selectionGroupNumberFlag}`] =
            groupNumber;
          update[`flags.${moduleName}.${selectionGroupColorFlag}`] =
            groupColor;
        }

        await token.combatant.update(update);
      }
    };

    for (const [index, group] of combatGroups.entries()) {
      if (group.tokens.length) {
        await processGroup(
          group.tokens,
          index,
          group.id,
          group.number,
          group.color,
          group.persist,
          useInitiativeTiebreaking,
        );
      }
    }

    const activeCombatHasStarted = game.combats.find(
      (combat) => combat.active && combat.started,
    );
    if (activeCombatHasStarted) {
      await activeCombatHasStarted.update({
        round: activeCombatHasStarted.round,
        turn: 0,
      });
    }
  }
}
