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
![Home Page](./screenshots/home.png)

### Video Player
![Video Player](./screenshots/player.png)

### Details Page
![Details Page](./screenshots/details.png)

### Browse Page
![Browse Page](./screenshots/browse.png)

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
- **[Sanction](https://sanction.tv))** - Streaming API

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Made with ❤️ using Electron and Next.js

</div>
