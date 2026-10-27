// Hand-written from plans/spec-v1.md. Regenerate with `pnpm abi` once contracts are compiled.
export const zaaveAbi = [
  {
    "type": "function",
    "name": "USDC",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ]
  },
  {
    "type": "function",
    "name": "AUSDC",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ]
  },
  {
    "type": "function",
    "name": "POOL",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ]
  },
  {
    "type": "function",
    "name": "epoch",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "lastZaDay",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "nextZaDayAt",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "totalPrincipal",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "totalCredit",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "totalAssets",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "tvlCap",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "principal",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "user",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "shares",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "user",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "credit",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "user",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "piePriceOf",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "user",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "pendingYield",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "user",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "claimableYield",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "user",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "fulfillment",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ]
  },
  {
    "type": "function",
    "name": "deposit",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256"
      }
    ],
    "outputs": []
  },
  {
    "type": "function",
    "name": "withdraw",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256"
      }
    ],
    "outputs": []
  },
  {
    "type": "function",
    "name": "withdrawAll",
    "stateMutability": "nonpayable",
    "inputs": [],
    "outputs": []
  },
  {
    "type": "function",
    "name": "harvest",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "name": "user",
        "type": "address"
      }
    ],
    "outputs": []
  },
  {
    "type": "function",
    "name": "zaDay",
    "stateMutability": "nonpayable",
    "inputs": [],
    "outputs": []
  },
  {
    "type": "function",
    "name": "setPiePrice",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "name": "price",
        "type": "uint256"
      }
    ],
    "outputs": []
  },
  {
    "type": "function",
    "name": "cashOut",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256"
      }
    ],
    "outputs": []
  },
  {
    "type": "function",
    "name": "redeemForGiftCard",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "event",
    "name": "Deposited",
    "anonymous": false,
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "shares",
        "type": "uint256",
        "indexed": false
      }
    ]
  },
  {
    "type": "event",
    "name": "Withdrawn",
    "anonymous": false,
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "shares",
        "type": "uint256",
        "indexed": false
      }
    ]
  },
  {
    "type": "event",
    "name": "Harvested",
    "anonymous": false,
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true
      },
      {
        "name": "epoch",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ]
  },
  {
    "type": "event",
    "name": "ZaDay",
    "anonymous": false,
    "inputs": [
      {
        "name": "epoch",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "sharePrice",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "timestamp",
        "type": "uint256",
        "indexed": false
      }
    ]
  },
  {
    "type": "event",
    "name": "PiePriceSet",
    "anonymous": false,
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true
      },
      {
        "name": "price",
        "type": "uint256",
        "indexed": false
      }
    ]
  },
  {
    "type": "event",
    "name": "CashedOut",
    "anonymous": false,
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ]
  },
  {
    "type": "event",
    "name": "GiftCardRequested",
    "anonymous": false,
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "user",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ]
  }
] as const;
