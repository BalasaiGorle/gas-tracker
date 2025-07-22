## Real-Time Cross-Chain Gas Price Tracker with Wallet Simulation
## Overview
This project is a real-time dashboard for tracking and simulating blockchain transaction costs across Ethereum, Polygon, and Arbitrum. It helps users understand volatile gas fees and estimate total transaction costs in USD.

## Features
* Live Gas Prices: Real-time baseFeePerGas and maxPriorityFeePerGas for ETH, Polygon, Arbitrum.

* Wallet Simulation: Calculate total estimated USD cost (transaction value + gas) for hypothetical transactions.

* Live ETH/USD Price: Fetches real-time ETH to USD rates (via CoinGecko).

* Gas Price Chart: Visualizes average gas price trends using lightweight-charts.

* Simulation Mode: Toggle between live data and interactive cost simulation.

## Technical Stack
* Frontend: React.js, Zustand (state management), Tailwind CSS (styling)

* Web3: ethers.js (RPC interaction)

* APIs: Infura RPC (WebSockets for gas), CoinGecko (ETH/USD price)

* Charting: lightweight-charts

## Setup & Installation
Clone: git clone <repository-url> gas-tracker && cd gas-tracker

* Install: npm install

* Tailwind CSS: npx tailwindcss init -p and update tailwind.config.js and src/index.css as per standard setup.

* Infura API Key:

* Get your Project ID (API Key) from MetaMask Developer (Infura RPC).

* Replace YOUR_INFURA_PROJECT_ID in src/App.js RPC_URLS with your actual key.

* Important: Ensure your Infura project's WebSocket endpoints for Ethereum, Polygon, and Arbitrum Mainnet are enabled.

* Run: npm start (opens at http://localhost:3000)

## Challenges & Solutions
* Real-time Data: Used ethers.providers.WebSocketProvider for live gas updates.

* Cross-Chain Gas: Handled chain-specific gas components (e.g., Arbitrum L1 gas estimation placeholder).

* ETH/USD & CORS: Bypassed localhost CORS issues for price fetching by switching from Uniswap logs to a public REST API (CoinGecko).

* State Management: Employed Zustand for efficient state updates with real-time data.

## Future Enhancements
* More advanced gas prediction models.

* Precise Arbitrum L1 gas calculation.

* Support for additional EVM chains.

* Comprehensive candlestick chart implementation.

* Customizable transaction types and gas limits for simulation.
## If any queries:
* contact: [balasaigorle@gmail.com]

