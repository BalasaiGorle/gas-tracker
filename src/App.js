import React, { useState, useEffect, useRef, useCallback } from 'react';
import { create } from 'zustand';
import { ethers } from 'ethers';
import { createChart, ColorType } from 'lightweight-charts';

// Zustand Store Definition
const useGasStore = create((set) => ({
    ethGas: { fast: null, avg: null, slow: null, baseFee: null, priorityFee: null, timestamp: null },
    polygonGas: { fast: null, avg: null, slow: null, baseFee: null, priorityFee: null, timestamp: null },
    arbitrumGas: { fast: null, avg: null, slow: null, baseFee: null, priorityFee: null, timestamp: null, l1GasEstimate: null },
    ethUsdPrice: null,
    simulationMode: false,
    transactionValue: 0.01,
    simulatedCosts: { eth: null, polygon: null, arbitrum: null },
    chartData: [],
    currentChartChain: 'ethereum',

    setEthGas: (gas) => set({ ethGas: gas }),
    setPolygonGas: (gas) => set({ polygonGas: gas }),
    setArbitrumGas: (gas) => set({ arbitrumGas: gas }),
    setEthUsdPrice: (price) => set({ ethUsdPrice: price }),
    toggleSimulationMode: () => set((state) => ({ simulationMode: !state.simulationMode })),
    setTransactionValue: (value) => set({ transactionValue: value }),
    setSimulatedCosts: (costs) => set({ simulatedCosts: costs }),
    addChartData: (data) => set((state) => ({ chartData: [...state.chartData, data] })),
    setCurrentChartChain: (chain) => set({ currentChartChain: chain }),
}));

// Constants for RPC URLs and Uniswap V3 Pool
const RPC_URLS = {
    // WebSocket URLs remain direct to Infura
    ethereum: 'wss://mainnet.infura.io/ws/v3/1c29b2a5aee0449285108945e609e2bb',
    polygon: 'wss://polygon-mainnet.infura.io/ws/v3/1c29b2a5aee0449285108945e609e2bb',
    arbitrum: 'wss://arbitrum-mainnet.infura.io/ws/v3/1c29b2a5aee0449285108945e609e2bb',
};

// Uniswap V3 ETH/USDC 0.05% pool address on Ethereum Mainnet
const UNISWAP_V3_ETH_USDC_POOL = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640';
// Uniswap V3 Swap event ABI for parsing logs
const UNISWAP_SWAP_EVENT_ABI = [
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
];

// Helper to calculate ETH/USD from sqrtPriceX96
const calculateEthUsdPrice = (sqrtPriceX96) => {
    const Q96 = ethers.BigNumber.from(2).pow(96);
    const priceX96 = ethers.BigNumber.from(sqrtPriceX96);

    const price_token0_per_token1_sqrt = Q96.mul(ethers.BigNumber.from(10).pow(12)).div(priceX96);
    const price_token0_per_token1 = price_token0_per_token1_sqrt.pow(2);
    const ethUsd = parseFloat(ethers.utils.formatUnits(price_token0_per_token1, 12));

    return ethUsd;
};


// Custom Hook for fetching gas prices
const useGasFetcher = (chainName, setGas, addChartData, currentChartChain) => {
    const providerRef = useRef(null);
    const intervalRef = useRef(null);

    const fetchGas = useCallback(async () => {
        if (!providerRef.current) return;

        try {
            const block = await providerRef.current.getBlock('latest');
            const baseFeePerGas = block.baseFeePerGas;

            let maxPriorityFeePerGas;
            try {
                const feeData = await providerRef.current.getFeeData();
                maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
            } catch (error) {
                console.warn(`Could not get fee data for ${chainName}, estimating priority fee.`, error);
                maxPriorityFeePerGas = ethers.utils.parseUnits("1.5", "gwei");
            }

            const fastGas = baseFeePerGas.add(maxPriorityFeePerGas.mul(2));
            const avgGas = baseFeePerGas.add(maxPriorityFeePerGas);
            const slowGas = baseFeePerGas.add(maxPriorityFeePerGas.div(2));

            let l1GasEstimate = null;
            if (chainName === 'arbitrum') {
                l1GasEstimate = ethers.utils.parseUnits("0.00001", "ether");
            }

            const now = Date.now();
            const gasData = {
                fast: parseFloat(ethers.utils.formatUnits(fastGas, "gwei")).toFixed(2),
                avg: parseFloat(ethers.utils.formatUnits(avgGas, "gwei")).toFixed(2),
                slow: parseFloat(ethers.utils.formatUnits(slowGas, "gwei")).toFixed(2),
                baseFee: parseFloat(ethers.utils.formatUnits(baseFeePerGas, "gwei")).toFixed(2),
                priorityFee: parseFloat(ethers.utils.formatUnits(maxPriorityFeePerGas, "gwei")).toFixed(2),
                timestamp: now,
                l1GasEstimate: l1GasEstimate ? parseFloat(ethers.utils.formatEther(l1GasEstimate)).toFixed(5) : null,
            };
            setGas(gasData);

            if (currentChartChain === chainName) {
                addChartData({ time: now / 1000, value: parseFloat(gasData.avg) });
            }

        } catch (error) {
            console.error(`Error fetching gas for ${chainName}:`, error);
        }
    }, [chainName, setGas, addChartData, currentChartChain]);

    useEffect(() => {
        if (!RPC_URLS[chainName] || RPC_URLS[chainName].includes('YOUR_INFURA_PROJECT_ID')) {
            console.error(`Please replace 'YOUR_INFURA_PROJECT_ID' in RPC_URLS for ${chainName}.`);
            return;
        }

        try {
            providerRef.current = new ethers.providers.WebSocketProvider(RPC_URLS[chainName]);
            console.log(`Connected to ${chainName} WebSocket.`);

            fetchGas();
            intervalRef.current = setInterval(fetchGas, 6000);

            return () => {
                if (intervalRef.current) clearInterval(intervalRef.current);
                if (providerRef.current) {
                    providerRef.current.destroy();
                    console.log(`Disconnected from ${chainName} WebSocket.`);
                }
            };
        } catch (error) {
            console.error(`Failed to connect to ${chainName} WebSocket:`, error);
        }
    }, [chainName, fetchGas]);
};

// Custom Hook for fetching ETH/USD price from Uniswap V3 logs
const useEthUsdPriceFetcher = (setEthUsdPrice) => {
    const providerRef = useRef(null);
    const intervalRef = useRef(null);

    const fetchPrice = useCallback(async () => {
        // No need for providerRef.current check here as it's set to null below
        // if (!providerRef.current) return;

        try {
            // IMPORTANT: Using the local proxy for the JSON RPC request to bypass CORS
            // The proxy is configured in src/setupProxy.js
            // The path will be /infura-proxy/v3/YOUR_API_KEY
            // Note: The API key is hardcoded here for the proxy path.
            const proxiedInfuraUrl = `/infura-proxy/v3/1c29b2a5aee0449285108945e609e2bb`;

            // Create a new JsonRpcProvider using the proxied URL
            const proxiedProvider = new ethers.providers.JsonRpcProvider(proxiedInfuraUrl);

            const latestBlockNumber = await proxiedProvider.getBlockNumber(); // Use proxiedProvider
            const filter = {
                address: UNISWAP_V3_ETH_USDC_POOL,
                topics: [ethers.utils.id("Swap(address,address,int256,int256,uint160,uint128,int24)")],
                fromBlock: latestBlockNumber - 5,
                toBlock: latestBlockNumber,
            };

            const logs = await proxiedProvider.getLogs(filter); // Use the proxied provider

            if (logs.length > 0) {
                const iface = new ethers.utils.Interface(UNISWAP_SWAP_EVENT_ABI);
                const parsedLog = iface.parseLog(logs[logs.length - 1]);

                const sqrtPriceX96 = parsedLog.args.sqrtPriceX96;
                const ethUsd = calculateEthUsdPrice(sqrtPriceX96);
                setEthUsdPrice(ethUsd);
            } else {
                console.warn("No recent Uniswap V3 Swap events found for ETH/USDC pool.");
            }
        } catch (error) {
            console.error("Error fetching ETH/USD price:", error);
        }
    }, [setEthUsdPrice]);

    useEffect(() => {
        // providerRef.current is set to null here because we are creating a new proxiedProvider
        // inside the fetchPrice function for each call. This is fine for this setup.
        providerRef.current = null;
        console.log("Initialized ETH/USD price fetcher (using local proxy for getLogs).");

        fetchPrice();
        intervalRef.current = setInterval(fetchPrice, 15000);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [fetchPrice]);
};

// Component for displaying gas prices
const GasPriceCard = ({ chainName, gasData, ethUsdPrice, l1GasEstimate }) => {
    const { simulationMode, transactionValue, simulatedCosts } = useGasStore();

    const getGasCostUsd = (gweiPrice) => {
        if (!gweiPrice || !ethUsdPrice) return 'N/A'; // Corrected from 'N/'
        const gasLimit = 210000;
        const gasCostEth = (parseFloat(gweiPrice) * gasLimit) / 1_000_000_000;
        let totalEthCost = gasCostEth;

        if (chainName === 'arbitrum' && l1GasEstimate) {
            totalEthCost += parseFloat(l1GasEstimate);
        }
        return (totalEthCost * ethUsdPrice).toFixed(4);
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg text-white flex-1 min-w-[280px]">
            <h3 className="text-xl font-semibold mb-4 capitalize">{chainName} Gas</h3>
            {gasData.timestamp ? (
                <>
                    <p className="text-sm text-gray-400 mb-2">Last Updated: {new Date(gasData.timestamp).toLocaleTimeString()}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <p>Base Fee:</p><p className="font-mono">{gasData.baseFee} Gwei</p>
                        <p>Priority Fee:</p><p className="font-mono">{gasData.priorityFee} Gwei</p>
                        <p>Slow:</p><p className="font-mono">{gasData.slow} Gwei</p>
                        <p>Average:</p><p className="font-mono">{gasData.avg} Gwei</p>
                        <p>Fast:</p><p className="font-mono">{gasData.fast} Gwei</p>
                        {chainName === 'arbitrum' && l1GasEstimate && (
                            <>
                                <p>L1 Gas Est.:</p><p className="font-mono">{l1GasEstimate} ETH</p>
                            </>
                        )}
                    </div>
                    {simulationMode && (
                        <div className="mt-4 pt-4 border-t border-gray-700">
                            <h4 className="text-md font-medium mb-2">Simulated Cost (Avg Gas)</h4>
                            <p className="text-lg font-bold text-green-400">
                                ${simulatedCosts[chainName] !== null ? simulatedCosts[chainName].toFixed(4) : 'Calculating...'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                (Transaction Value: {transactionValue} {chainName === 'ethereum' ? 'ETH' : 'MATIC'})
                            </p>
                        </div>
                    )}
                </>
            ) : (
                <p className="text-gray-400">Connecting to {chainName}...</p>
            )}
        </div>
    );
};

// Candlestick Chart Component
const GasPriceChart = ({ data, chainName }) => {
    const chartContainerRef = useRef();
    const chartRef = useRef(null);
    const seriesRef = useRef(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: 300,
            layout: {
                backgroundColor: ColorType.Solid,
                background: { type: ColorType.Solid, color: '#1f2937' },
                textColor: '#d1d5db',
            },
            grid: {
                vertLines: { color: '#374151' },
                horzLines: { color: '#374151' },
            },
            rightPriceScale: {
                borderColor: '#4b5563',
            },
            timeScale: {
                borderColor: '#4b5563',
                timeVisible: true,
                secondsVisible: false,
            },
            crosshair: {
                mode: 0,
            },
            watermark: {
                visible: true,
                fontSize: 24,
                horzAlign: 'center',
                vertAlign: 'center',
                color: 'rgba(255, 255, 255, 0.1)',
                text: `${chainName.toUpperCase()} Gas Price (Gwei)`,
            },
        });
        chartRef.current = chart;

        const newSeries = chart.addLineSeries({
            color: '#60a5fa',
            lineWidth: 2,
            priceFormat: {
                type: 'price',
                precision: 2,
                minMove: 0.01,
            },
        });
        seriesRef.current = newSeries;

        const handleResize = () => {
            if (chartRef.current && chartContainerRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                });
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
                seriesRef.current = null;
            }
        };
    }, [chartContainerRef]);

    useEffect(() => {
        if (seriesRef.current) {
            seriesRef.current.setData(data);
        }
        if (chartRef.current) {
            chartRef.current.applyOptions({
                watermark: {
                    text: `${chainName.toUpperCase()} Gas Price (Gwei)`,
                },
            });
        }
    }, [data, chainName]);

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg mt-8" ref={chartContainerRef}>
            <h3 className="text-xl font-semibold text-white mb-4 capitalize">{chainName} Gas Price Volatility</h3>
        </div>
    );
};


// Main App Component
const App = () => {
    const {
        ethGas, polygonGas, arbitrumGas, ethUsdPrice,
        simulationMode, transactionValue, simulatedCosts,
        setEthGas, setPolygonGas, setArbitrumGas, setEthUsdPrice,
        toggleSimulationMode, setTransactionValue, setSimulatedCosts,
        chartData, addChartData, currentChartChain, setCurrentChartChain
    } = useGasStore();

    useGasFetcher('ethereum', setEthGas, addChartData, currentChartChain);
    useGasFetcher('polygon', setPolygonGas, addChartData, currentChartChain);
    useGasFetcher('arbitrum', setArbitrumGas, addChartData, currentChartChain);

    useEthUsdPriceFetcher(setEthUsdPrice);

    useEffect(() => {
        if (simulationMode && ethUsdPrice !== null) {
            const gasLimit = 210000;

            const calculateCost = (gasData, isArbitrum = false) => {
                if (!gasData || gasData.avg === null) return null;
                const avgGwei = parseFloat(gasData.avg);
                let gasCostEth = (avgGwei * gasLimit) / 1_000_000_000;

                if (isArbitrum && gasData.l1GasEstimate) {
                    gasCostEth += parseFloat(gasData.l1GasEstimate);
                }

                const txValueInEth = transactionValue;
                return (txValueInEth * ethUsdPrice) + (gasCostEth * ethUsdPrice);
            };

            setSimulatedCosts({
                eth: calculateCost(ethGas),
                polygon: calculateCost(polygonGas),
                arbitrum: calculateCost(arbitrumGas, true),
            });
        }
    }, [simulationMode, transactionValue, ethUsdPrice, ethGas, polygonGas, arbitrumGas, setSimulatedCosts]);

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 p-8 font-inter">
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                body { font-family: 'Inter', sans-serif; }
                .chart-container {
                    width: 100%;
                    height: 300px; /* Fixed height for the chart */
                }
                `}
            </style>
            <h1 className="text-4xl font-bold text-center mb-10 text-blue-400">
                Cross-Chain Gas Price Tracker & Wallet Simulator
            </h1>

            <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8 flex items-center justify-between">
                <div>
                    <span className="text-xl font-medium">ETH/USD Price:</span>{' '}
                    <span className="text-2xl font-bold text-green-400">
                        {ethUsdPrice ? `$${ethUsdPrice.toFixed(2)}` : 'Fetching...'}
                    </span>
                </div>
                <div className="flex items-center space-x-4">
                    <label htmlFor="simulationToggle" className="text-lg font-medium">Simulation Mode:</label>
                    <input
                        type="checkbox"
                        id="simulationToggle"
                        className="toggle toggle-primary"
                        checked={simulationMode}
                        onChange={toggleSimulationMode}
                    />
                </div>
            </div>

            {simulationMode && (
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
                    <label htmlFor="transactionValue" className="block text-lg font-medium mb-2">
                        Simulate Transaction Value (ETH/MATIC):
                    </label>
                    <input
                        type="number"
                        id="transactionValue"
                        className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-white"
                        value={transactionValue}
                        onChange={(e) => setTransactionValue(parseFloat(e.target.value) || 0)}
                        step="0.01"
                        min="0"
                    />
                    <p className="text-sm text-gray-400 mt-2">
                        Enter the value of your transaction (e.g., 0.1 ETH for a swap). This will be converted to USD.
                        Gas costs are added on top.
                    </p>
                </div>
            )}

            <div className="flex flex-wrap gap-6 justify-center mb-8">
                <GasPriceCard chainName="ethereum" gasData={ethGas} ethUsdPrice={ethUsdPrice} />
                <GasPriceCard chainName="polygon" gasData={polygonGas} ethUsdPrice={ethUsdPrice} />
                <GasPriceCard chainName="arbitrum" gasData={arbitrumGas} ethUsdPrice={ethUsdPrice} l1GasEstimate={arbitrumGas.l1GasEstimate} />
            </div>

            <h2 className="text-3xl font-bold text-center mb-6 text-blue-400">Gas Price Chart</h2>
            <div className="flex justify-center mb-4 space-x-4">
                <button
                    className={`px-6 py-2 rounded-md font-semibold ${currentChartChain === 'ethereum' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    onClick={() => setCurrentChartChain('ethereum')}
                >
                    Ethereum
                </button>
                <button
                    className={`px-6 py-2 rounded-md font-semibold ${currentChartChain === 'polygon' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    onClick={() => setCurrentChartChain('polygon')}
                >
                    Polygon
                </button>
                <button
                    className={`px-6 py-2 rounded-md font-semibold ${currentChartChain === 'arbitrum' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    onClick={() => setCurrentChartChain('arbitrum')}
                >
                    Arbitrum
                </button>
            </div>

            <GasPriceChart data={chartData} chainName={currentChartChain} />

            <div className="mt-12 p-6 bg-gray-800 rounded-lg shadow-lg text-gray-300 text-sm">
                <h3 className="text-xl font-semibold text-white mb-4">Notes on Implementation:</h3>
                <ul className="list-disc list-inside space-y-2">
                    <li>**RPC Endpoints:** You MUST replace `YOUR_INFURA_PROJECT_ID` in `RPC_URLS` with your actual Infura project ID for the application to function.</li>
                    <li>**Gas Price Estimation:** The "fast", "average", and "slow" gas price estimations are heuristic. Real-world dApps often use more sophisticated algorithms or third-party gas APIs for better accuracy. `maxPriorityFeePerGas` is estimated or fetched via `getFeeData()`.</li>
                    <li>**Arbitrum L1 Gas:** Calculating Arbitrum's L1 gas fee is complex. This implementation uses a simplified placeholder `l1GasEstimate`. A full solution would involve querying Arbitrum-specific RPC methods (e.g., `eth_estimateGas` with specific calldata for L1 portion) or using an Arbitrum SDK.</li>
                    <li>**Uniswap V3 Price:** The `calculateEthUsdPrice` function directly parses `sqrtPriceX96` from Uniswap V3 `Swap` events. It performs the necessary scaling for token decimals (USDC=6, WETH=18) to derive the ETH/USD price. It fetches logs for the last 5 blocks to ensure a recent price.</li>
                    <li>**Chart Data:** For simplicity, the `lightweight-charts` displays a line chart of the "Average" gas price. Generating true candlestick data (Open, High, Low, Close) from real-time streaming gas prices would require collecting data points over fixed intervals (e.g., 15 minutes) and then aggregating them.</li>
                    <li>**Transaction Value Simulation:** The `transactionValue` input directly represents the value of the asset being transacted (e.g., 0.1 ETH). The simulated cost adds this value (converted to USD) to the estimated gas cost. The `gasLimit` for simulation is a fixed example value (210,000); actual gas limits vary greatly by transaction type.</li>
                    <li>**Zustand:** The application uses Zustand for global state management, allowing different components to access and update real-time data and simulation parameters.</li>
                </ul>
            </div>
        </div>
    );
};

export default App;
