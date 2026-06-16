# FoundryVTT Disposition Initiative

![Foundry v13](https://img.shields.io/badge/Foundry-v13-informational)
![GitHub downloads](https://img.shields.io/github/downloads/MrMikki-boop/disposition-initiative/total?label=Downloads)
![GitHub downloads latest](https://img.shields.io/github/downloads/MrMikki-boop/disposition-initiative/latest/total?label=Downloads%20Latest%20Release)
[![Report bugs on GitHub](https://img.shields.io/badge/Report%20Bugs%20on%20GitHub-2dba4e?logo=GitHub&logoColor=white)](https://github.com/MrMikki-boop/disposition-initiative/issues)

Disposition Initiative is a Foundry VTT module for running group initiative in D&D 5e. It can roll once for a selected group of tokens, apply that initiative to the whole group, and keep separate initiative groups inside the same encounter.

This fork adds selection-based initiative groups, Russian localization, and Foundry VTT v13 / D&D 5e 5.3.x-oriented workflow tweaks.

## Features

- Create initiative groups from selected tokens.
- Re-roll the same group by selecting the exact same set of tokens again.
- Create a new group by selecting a new set of tokens, including a subset of an existing group.
- Keep group numbers stable; new groups use the first available number.
- Show compact group badges in the combat tracker.
- Fall back to disposition grouping for tokens without selection groups.
- Choose grouping mode: selection groups, token disposition, or same actor.
- Choose initiative roll mode: normal rolls, passive initiative for everyone, or passive initiative for NPC groups.
- Swap initiative values from the combat tracker context menu for Alert-style initiative exchange.
- Optionally group player-owned tokens with friendly tokens when using disposition grouping.
- Optionally re-roll group initiative at the start of each new round.
- Russian, English, and Brazilian Portuguese localization.

## How Selection Groups Work

1. Select the tokens you want to act as one initiative group.
2. Click the **Group Initiative** button in the Token Controls menu or in the Combat Tracker.
3. The selected tokens receive one shared group roll, with small decimal tie-breakers when enabled.
4. Select the exact same set again to re-roll that group without changing its group number.
5. Select a different set to create a new group.

Example:

- Select four goblins: they become `Group 1`.
- Select the same four goblins again: `Group 1` is re-rolled.
- Select two of those goblins: those two become a new group.
- Select the whole combat after several groups exist: existing groups stay separate.

## Buttons

- **Group Initiative**: rolls initiative for the selected group or existing combat groups.
- **Clear Initiative Groups**: clears stored group flags for the current combat.
- **Swap Initiative**: available from a combatant context menu. The GM chooses another combatant and swaps their initiative values.

## Settings

- **Use Group Initiative Tiebreaker**: adds decimal tie-breakers so grouped combatants do not have identical initiative values.
- **Initiative Roll Mode**: chooses whether groups roll normally, use passive initiative for everyone, or use passive initiative only for NPC-only groups.
- **Grouping Mode**: chooses whether groups are built from exact token selections, token disposition, or same actor.
- **Group Players with Friendly Tokens**: includes player-owned tokens in the friendly group when using disposition fallback.
- **Reroll Initiatives Every Round**: re-rolls group initiatives at the start of each new round.

## Alert-Style Initiative Exchange

D&D 2024 Alert allows a character to exchange initiative with a willing ally after initiative is rolled. The module does not try to detect the feat by item id or localized name. Instead, it gives the GM a controlled context-menu action:

1. Right-click a combatant in the combat tracker.
2. Choose **Swap Initiative**.
3. Choose the target combatant.
4. The two initiative values are exchanged.

The action requires both combatants to already have initiative values. It blocks obvious incapacitated states when Foundry exposes those statuses on the actor or token.

## Installation

Paste this manifest URL into Foundry VTT's **Install Module** dialog:

```text
https://github.com/MrMikki-boop/disposition-initiative/releases/latest/download/module.json
```

You can also download a release archive from:

```text
https://github.com/MrMikki-boop/disposition-initiative/releases
```

## Compatibility

- Foundry VTT: v13
- Target workflow: Dungeons & Dragons Fifth Edition 5.3.x

## Credits

Original module by Luiz Bertoni.

Fork maintenance and selection-group workflow by MaxKoffing.

## Licenses

- **Source code:** MIT License. See [LICENSE](LICENSE).
- **Foundry VTT:** This project follows the Foundry VTT Limited License Agreement for module development.
