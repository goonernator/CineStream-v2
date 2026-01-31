# 🎬 CineStream

<div align="center">

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Electron](https://img.shields.io/badge/Electron-32.0.0-47848F.svg)
![Next.js](https://img.shields.io/badge/Next.js-16.1.1-black.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-blue.svg)

A modern Netflix-style desktop streaming application built with Electron and Next.js.

[Features](#-features) • [Installation](#-installation) • [Screenshots](#-screenshots) • [Credits](#-credits)

</div>

---

## ✨ Features

- 🎨 **Netflix-inspired UI** - Beautiful, modern interface with smooth animations
- 🎬 **Movie & TV Streaming** - Watch your favorite content with a custom video player
- 🔐 **TMDB Integration** - Sign in with TMDB account, sync watchlist and favorites
- 📱 **Multi-Profile Support** - Create and switch between multiple user profiles
- 🔄 **Continue Watching** - Automatically resume from where you left off
- 🎯 **Personalized Recommendations** - AI-powered suggestions based on your watch history
- 🔔 **Smart Notifications** - Get notified about new releases and trending content
- 🎭 **Genre Browsing** - Explore content by genre with beautiful category pages
- ⌨️ **Keyboard Shortcuts** - Full keyboard navigation support
- 🌓 **Theme Support** - Multiple themes including dark, light, midnight, and crimson

## 🖼️ Screenshots

<div align="center">

### Home Page

<img width="1606" height="902" alt="home" src="https://github.com/user-attachments/assets/a76c5e15-6e10-4523-8e06-82277801457d" />


### Video Player

<img width="1739" height="895" alt="player" src="https://github.com/user-attachments/assets/a2bcb588-f05e-41d1-a62e-742f556ca9a6" />


### Details Page

<img width="1523" height="1042" alt="details" src="https://github.com/user-attachments/assets/74eb002d-0beb-47df-8474-c32989eb6c05" />

### Settings Page

<img width="1513" height="1299" alt="settings" src="https://github.com/user-attachments/assets/62aa1c69-fbf9-4acc-ab34-770b4dddff32" />


### Search Page

<img width="1513" height="1030" alt="search" src="https://github.com/user-attachments/assets/4e7849a5-3d40-4a95-9330-5c21621a2fb1" />

</div>

## 🚀 Installation

### Prerequisites

- Node.js 18+ and npm
- TMDB API key ([Get one here](https://www.themoviedb.org/settings/api))

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/goonernator/cinestream-v2.git
   cd cinestream
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env.local` file in the root directory:
   ```env
   NEXT_PUBLIC_TMDB_API_KEY=your_tmdb_api_key_here
   ```

4. **Run in development mode**
   ```bash
   npm run electron:dev
   ```

5. **Build for production**
   ```bash
   npm run electron:build
   ```
   
   The executable will be in the `dist/` folder.

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Desktop:** Electron 32
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Video Player:** Video.js + HLS.js
- **APIs:** TMDB, Rivestream, tlo.sh

## 📁 Project Structure

```
├── app/              # Next.js pages and API routes
├── components/       # React components
├── electron/         # Electron main process
├── lib/             # Utilities and API clients
└── public/          # Static assets
```

## 🎯 Credits

Special thanks to **[barcodebimbo](https://github.com/barcodebimbo)** for:
- The Rivestream API integration and inspiration
- Providing the foundation that made this project possible
- check out **[Free Movies](https://sanction.tv)** this is why this project exists

This project also uses:
- **[TMDB](https://www.themoviedb.org/)** - Movie and TV metadata
- **[Sanction](https://sanction.tv)** - Streaming API

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Made with ❤️ using Electron and Next.js

</div>
