<h1 align="center">
  <a href="https://mimic.fi"><img src="https://www.mimic.fi/logo.png" alt="Mimic Protocol" width="200"></a> 
</h1>

<h4 align="center">Blockchain automation protocol</h4>

<p align="center">
  <a href="https://discord.mimic.fi">
    <img src="https://img.shields.io/discourse/status?server=https%3A%2F%2Fmeta.discourse.org" alt="Discord">
  </a>
</p>

<p align="center">
  <a href="#content">Content</a> •
  <a href="#setup">Setup</a> •
  <a href="#deploy">Deploy</a> •
  <a href="#license">License</a>
</p>

---

## Content

This package contains the smart contracts used for Mimic Protocol on EVM-like chains.

## Setup

To set up this project you'll need [git](https://git-scm.com) and [yarn](https://classic.yarnpkg.com) installed.
From your command line:

```bash
# Clone this repository
$ git clone https://github.com/mimic-protocol/contracts

# Go into the repository
$ cd contracts

# Install dependencies
$ yarn

# Move to the evm package
$ cd packages/evm
```

## Deploy

This project uses Hardhat Ignition to manage deployments in a modular and reproducible way.
The deployment logic is defined in the `ignition/modules` directory.

For example:

- `Controller.ts` – deploys the Controller contract
- `Settler.ts` – deploys the Settler contract

### Parameter Configuration

Each deployment requires a parameter file per network, located in `ignition/parameters`.

If you're deploying to a new network, create a new parameter file under `ignition/parameters/<network>.json` before deploying with the following structure:

```json
{
  "Controller": {
    "admin": "0xYourAdminAddress",
    "solvers": ["0xYourSolverAddress"],
    "executors": [],
    "proposalSigners": ["0xYourSignerAddress"]
  },
  "Settler": {
    "admin": "0xYourAdminAddress"
  }
}
```

### Local Deployment

Start a local Hardhat node by running

```bash
yarn hardhat node
```

Now, deploy using the local parameter file:

```bash
yarn hardhat ignition deploy ignition/modules/Settler.ts --network localhost --parameters ignition/parameters/localhost.json
```

### Production Deployment

Deploy using your desired network parameter file:

```bash
yarn hardhat ignition deploy ignition/modules/Settler.ts --network <network> --parameters ignition/parameters/<network>.json
```

Note that Ignition tracks previous deployments. If a deployment already exists in `ignition/deployments`, it won’t re-deploy unless something changes.

## License

Private

---

> Website [mimic.fi](https://mimic.fi) &nbsp;&middot;&nbsp;
> GitHub [@mimic-fi](https://github.com/mimic-fi) &nbsp;&middot;&nbsp;
> Twitter [@mimicfi](https://twitter.com/mimicfi) &nbsp;&middot;&nbsp;
> Discord [mimic](https://discord.mimic.fi)
