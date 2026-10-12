# GrokBot Minecraft

A [Mineflayer](https://github.com/PrismarineJS/mineflayer) bot that joins your local Minecraft Java server and **builds things from chat commands**: houses, castles, ships, cities, mountains, canyons and more. You can **watch it place builds block by block** or have it build huge terrain instantly. A small Windows launcher (Python/tkinter) starts and stops the server and the bot for you.

## Features

- **Over 50 builds:** structures, modern houses, vehicles, pixel art, statues and full landscapes, all built in front of you and facing you.
- **Watch mode (default):** the bot flies to each spot, looks at it, swings and places one block at a time. It builds the floor first, then the walls layer by layer, then the roof and details. Speed is adjustable.
- **Fast mode:** chunked `/fill` commands, up to 500,000 blocks for terrain, without lag spikes.
- **`undo`** restores the last 5 builds; **`clear <radius>`** resets an area to flat grass.
- **Helpers:** come, follow, goto, fly, mine, chop, attack, guard, inventory, auto-eat, respawn and auto-reconnect.
- **HTTP control:** `http://localhost:3001/cmd?c=build%20castle`, plus `/status`, `/block` and `/count`.
- **Windows launcher:**
  - START/STOP (STOP saves the world).
  - Status lights and a player list.
  - Log tabs, a build dropdown and a server console.
  - Child processes are tied to the launcher, so nothing is left running.

## Requirements

- Minecraft Java Edition **26.1** (the client you join with)
- **Java 25** (needed by the 26.1 server), on PATH, via `JAVA_HOME`, or set in `settings.json`
- **Node.js 18+**
- **Python 3.10+**, only to run or build the launcher

## Setup

1. Download the official **Minecraft Java 26.1 server jar** from Mojang yourself and save it as `server/server.jar`. It's not included in this repo.
2. In `server/`, run the jar once (or `start-server.bat`). It creates `eula.txt`. Read the [Minecraft EULA](https://www.minecraft.net/eula) and set `eula=true` if you agree.
3. Copy the values from `server/server.properties.template` into `server/server.properties`: creative flat world, `online-mode=false`, bound to `127.0.0.1`.
4. Make the bot an operator so it can use `/fill` and `/setblock`. Type `op GrokBot` in the server console once the bot has joined. In the launcher, use the console box.
5. Install the bot:
   ```
   cd bot
   npm install
   ```
6. Start everything:
   - **Launcher:** `python launcher/launcher.py`, or the built exe (see below). Click **START**.
   - **Or the .bat files:** `server/start-server.bat`, wait for `Done`, then `bot/start-bot.bat`.

Optional `settings.json` in the project root, used by the launcher:
```json
{ "player": "YourMinecraftName", "java": "C:/Program Files/Java/jdk-25/bin/java.exe" }
```
`player` makes come, follow and guard, and builds started from the launcher, use your position. If it's empty, builds happen at the bot's position.

## How to join

In your launcher, create a **Vanilla 26.1** profile, then go to **Multiplayer → Direct Connection → `localhost`**.

## Commands (type in Minecraft chat)

| Command | What it does |
|---|---|
| `help`, `list` / `builds` | show commands / every build |
| `mode watch` / `mode fast` | block-by-block (default) or instant building |
| `speed <n>` | watch-mode blocks per second (default 8) |
| `undo` | remove the last build (last 5 remembered) |
| `clear <radius>` | reset the area around you to flat grass (no undo) |
| `stop` | stop moving or building |
| `come`, `follow`, `goto x y z`, `fly [h]`, `land` | movement |
| `give <block>`, `inv` | hold a block / show inventory |
| `mine <block> [n]`, `chop [n]`, `attack`, `guard` | survival helpers |
| `say <text>` | the bot says something |
| `fill x1 y1 z1 x2 y2 z2 <block>` | fill a box |

### Builds: `build <name> [options]`

**Structures:** `house [block]`, `modern simple|normal|advanced`, `medieval house`, `cabin`, `cottage`, `castle [size]`, `skyscraper [height] [width]`, `lighthouse [height]`, `windmill`, `bridge [length]`, `pixel art <creeper|heart|smiley|sword|pig|diamond|mushroom> [scale]`, `statue <steve|creeper|golem> [scale]`, `ship [length]`, `pirate ship [length]`, `temple [size]`, `pagoda [floors]`, `farm`, `village [houses]`, `road [length]`, `fountain`, `garden [size]`, `maze [size] [block]`, `stadium [size]`, `rollercoaster [size]`, `car [color]`, `plane [length]`, `rocket [height]`, `treehouse`, `igloo`, `snowman [scale]`, `tower <block> <h>`, `wall <block> <len> <h>`, `pyramid <block> <size>`, `platform <block> <w> <l>`, `sphere <block> <r>`

**Terrain:** `mountain <size>`, `hill <size>`, `volcano <size>`, `island <size>`, `lake <size>`, `river <length>`, `tree [type]`, `forest <n> [type]`, `giant tree [height] [wood]`, `waterfall [height]`, `canyon [length]`, `desert [size]`, `mushroom forest [count]`, `crystal cave [radius]`, `floating islands [count]`, `city [size]`

Block names can be written naturally: `build tower stone bricks 20`.

## Building the launcher exe

```
pip install pyinstaller
pyinstaller --onefile --windowed --name "GrokBot Minecraft" launcher/launcher.py
```
Put `dist/GrokBot Minecraft.exe` in the project root, next to `server/` and `bot/`.

## ⚠️ Security

`online-mode=false` turns off Minecraft account checks so the offline bot can join. **Use this only on your own machine or a trusted LAN.** Keep `server-ip=127.0.0.1` and never port-forward 25565. The bot is an operator, and its HTTP control port (3001) only listens on localhost.

## License

MIT, see [LICENSE](LICENSE). Minecraft is a trademark of Mojang/Microsoft. This project isn't affiliated with them and doesn't include any Mojang files.