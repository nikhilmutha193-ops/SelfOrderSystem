# SelfOrder print agent

A small program that runs on one computer in the restaurant (usually the billing counter PC). It picks up KOTs and bills from the SelfOrder server and sends them to thermal printers on the same network or plugged into that computer.

The server is never connected to the printers directly, so this works the same whether the server runs in the restaurant or in the cloud. The agent only prints **while it is running**, so it is set up to start by itself with Windows.

## Setup on Windows (PrintAgent.exe)

No Node.js and no other files are needed.

1. In the admin open **Printers & Stations** and press **Download PrintAgent.zip**. Copy it to the printing computer and **Extract All** (a `.exe` cannot be run from inside a zip). The zip carries the website's address, so the window already knows it.
2. In the admin press **Add computer** and note the pairing code (good for 15 minutes).
3. Open **PrintAgent.exe**. A small window appears: type the code and press **Set up and start**. Windows asks for permission once; choose **Yes**.
4. The window turns green: **Connected**. It pairs the computer, makes the agent start by itself every time Windows starts (hidden, even if nobody signs in) and starts it now. You can close the window; the agent keeps running.
5. Back in **Printers & Stations**, add each printer, choose this computer, and press **Test**. Tick "Prints KOTs without a station" for kitchen tickets.

Open `PrintAgent.exe` again at any time to see whether it is connected, restart or stop it, remove the automatic start, or pair again with a new code. What it is doing is also written to `agent.log` next to the exe. Turn off sleep in the Windows power settings and keep the computer switched on during service.

Files it keeps next to the exe: `config.json` (the pairing, keep it private: it lets the computer read print jobs), `agent.log`, `agent.status.json`, `autostart.installed`, and `server.txt` (the website address from the zip).

## Setup with Node.js (any system)

Needs Node.js 18 or newer and the files of this folder (the admin's second download).

- **Windows:** run `node agent.js` in the folder: the same setup window opens.
- **Anywhere, from a command line:**
  ```
  node agent.js pair --server https://your-restaurant-server --code ABCD2345
  node agent.js run
  ```
  `pair` saves `config.json` next to `agent.js`; `run` keeps printing until you stop it (Ctrl+C). On Mac and Linux, start it with your system's service manager if it should survive a restart. `PRINT_AGENT_CONFIG` keeps the config file elsewhere.

## Building PrintAgent.exe

On a Windows computer with Node.js 20 or newer, in this folder:

```
node build-exe.js
```

It writes `dist/PrintAgent.exe` (Node.js and the setup window inside one file, about 90 MB). Copy that file to the server's `downloads` folder (see `../downloads/README.md`) so it appears in the admin. Rebuild after changing `agent.js` or `setup-ui.html`.

## Commands

| Command | What it does |
| --- | --- |
| *(none)*, `ui` | Windows: open the setup window. Other systems: run the agent in the foreground. |
| `pair --server <url> --code <code>` | Pair this computer and save `config.json`. |
| `run` | Print until stopped. This is what the startup task runs. A second copy refuses to start. |
| `admin install\|start\|stop\|remove` | What the window runs as administrator: create or remove the startup task, start or stop the agent. |

## How printing works

- Every KOT is split by kitchen station. Each part goes to the printers assigned to that station. Items without a station (or with a station that has no printer) go to the printers marked "Prints KOTs without a station".
- Bills go to the printers marked "Prints bills", either when staff click **Print bill** or automatically after a bill is generated if "Print the bill automatically" is on.
- A job that fails is retried up to 3 times. After that it shows as failed in **Printers & Stations** where it can be retried.
- Printers are either **network** (LAN or Wi-Fi with a fixed IP address, port 9100) or **shared** (plugged into this Windows computer and shared in Windows: Printer properties > Sharing > "Share this printer"; use the share name in the admin).

## Troubleshooting

- *The window says "Can't reach the server"*: check the computer's internet connection and the server address (Pair again shows it).
- *"This computer was removed"*: it was removed or re-paired in the admin. Press Add computer or New code there and pair again.
- *"Printer at 192.168.x.x did not respond"*: check the printer's IP address (most printers print it when you hold the feed button while switching on) and that this computer is on the same network.
- *Shared printer fails with "cannot find the file"*: the share name is wrong, or the printer is not shared under that name.
- To pair with a different restaurant or server, press **Pair again** in the window.
- *The agent goes offline when the laptop is unplugged*: press **Set up and start** once more after updating (it re-creates the startup task so it keeps running on battery; an older task is stopped by Windows when the charger is removed). Then check the laptop's power settings: *Sleep* on battery set to **Never** while it prints, *When I close the lid* set to **Do nothing**, and in Device Manager > Network adapters > your Wi-Fi adapter > Power Management turn off "Allow the computer to turn off this device to save power". The agent itself stops the laptop sleeping when idle while it runs, but it cannot override the lid or the power button.
