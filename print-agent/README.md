# SelfOrder print agent

A small program that runs on one computer in the restaurant (usually the billing counter PC). It picks up KOTs and bills from the SelfOrder server and sends them to thermal printers on the same network or plugged into that computer.

The server is never connected to the printers directly, so this works the same whether the server runs in the restaurant or in the cloud.

## Requirements

- Node.js 18 or newer, or the single-file `PrintAgent.exe` (see below), which needs no Node.js
- An ESC/POS thermal printer (58 mm or 80 mm), either:
  - **Network**: connected by LAN or Wi-Fi with a fixed IP address. The agent sends to port 9100.
  - **Shared (USB)**: plugged into this Windows computer and shared in Windows (Printer properties > Sharing > "Share this printer"). Use the share name in the admin panel.

## Setup

1. In the admin panel open **Printers & Stations** and click **Add computer**. Copy the 8-character pairing code (valid for 15 minutes).
2. On the printing computer, copy this folder (if you downloaded the .zip, right-click it and choose **Extract All** first; the scripts do not work from inside the zip) and run:

   ```
   node agent.js pair --server https://your-restaurant-server --code ABCD2345
   ```

   This saves `config.json` next to `agent.js`. Keep it private: it lets the computer read print jobs.
3. Start the agent:

   ```
   node agent.js
   ```

4. Back in **Printers & Stations**, add each printer, choose this computer, and click **Test** to print a test page.

**No Node.js on that computer?** Use the single-file build, which carries its own Node.js, so nothing is installed or downloaded there. On any Windows computer that has Node.js 20 or newer (your own PC will do), run this once in the `print-agent` folder:

```
node build-exe.js
```

It writes the `dist` folder (`PrintAgent.exe`, about 90 MB, plus `pair.bat` and `start-agent.bat`). Copy that folder to the printing computer, then:

```
pair.bat https://your-restaurant-server ABCD2345
start-agent.bat
```

(`PrintAgent.exe pair --server ... --code ...` and `PrintAgent.exe` do the same by hand.) The pairing is saved in `config.json` next to the exe. Rebuild and copy the exe again after the agent code changes.

To start it automatically with Windows, create a shortcut to `start-agent.bat` in the Startup folder (`Win + R`, then `shell:startup`).

## How printing works

- Every KOT is split by kitchen station. Each part goes to the printers assigned to that station. Items without a station (or with a station that has no printer) go to the printers marked "Prints KOTs without a station".
- Bills go to the printers marked "Prints bills", either when staff click **Print bill** or automatically after a bill is generated if "Print the bill automatically" is on.
- A job that fails is retried up to 3 times. After that it shows as failed in **Printers & Stations** where it can be retried.

## Troubleshooting

- *"This computer was removed"*: it was removed or re-paired in the admin panel. Add it again and run the pair command with the new code.
- *"Printer at 192.168.x.x did not respond"*: check the printer's IP address (most printers print it when you hold the feed button while switching on) and that this computer is on the same network.
- To pair with a different restaurant or server, delete `config.json` and pair again. Set `PRINT_AGENT_CONFIG` to keep the config file elsewhere.
