# ARC-AGI Player — Persona Agent Demo

A Next.js app that uses a [Persona](https://www.runtype.ai) AI agent to play [ARC-AGI-3](https://arcprize.org) puzzle games. The agent uses tool calls to interact with the ARC-AGI-3 API, reasoning about game states and taking strategic actions to solve puzzles.

## How It Works

- **Left panel**: Renders the ARC-AGI-3 game grid in real-time, showing the current frame, score, level, and available actions
- **Right panel**: Persona chat widget with an agent configured for ARC-AGI-3 gameplay
- The agent has 4 tools: `arc_list_games`, `arc_start_game`, `arc_simple_action`, `arc_click_action`
- Each tool call hits the ARC-AGI-3 API and returns the updated game frame
- The game board updates automatically when tool results arrive

## Setup

1. Start the Persona proxy from the repo root:

```bash
pnpm dev
```

2. Install and run this example:

```bash
cd examples/arc-agi-player
pnpm install
pnpm dev
```

3. Open [http://localhost:3001](http://localhost:3001)

4. Tell the agent to play a game:
   - "Play the ls20 game"
   - "List available games"
   - "Play ft09 and explain your strategy"

## Environment Variables

Copy `.env.local.example` to `.env.local` and configure:

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_PERSONA_API_URL` | Persona dispatch API URL | `http://localhost:43111/api/chat/dispatch` |

## Architecture

```
app/
  layout.tsx          # Root layout
  page.tsx            # Main page — manages game state, renders board + widget
  globals.css         # Dark theme styling

components/
  GameBoard.tsx       # ARC grid renderer with color palette
  PersonaAgent.tsx    # Persona widget wrapper with agent config and tool event handling

lib/
  arc-colors.ts       # ARC 16-color palette (indices 0-15)
  arc-types.ts        # TypeScript types for ARC API responses
```
