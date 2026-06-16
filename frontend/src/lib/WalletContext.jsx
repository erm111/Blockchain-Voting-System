import { createContext, useContext, useCallback, useState } from "react";
import { connectWallet, writeContract, readContract } from "../chain";

const WalletCtx = createContext(null);

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [signer, setSigner] = useState(null);
  const [isOfficial, setIsOfficial] = useState(false);
  const [error, setError] = useState("");

  const connect = useCallback(async () => {
    setError("");
    try {
      const { signer, address } = await connectWallet();
      setSigner(signer);
      setAccount(address);
      const c = await readContract();
      setIsOfficial(await c.isOfficial(address));
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }, []);

  // Run a contract write: execute, wait, surface errors. Returns true on success.
  const tx = useCallback(
    async (fn) => {
      setError("");
      try {
        const c = await writeContract(signer);
        const t = await fn(c);
        await t.wait();
        return true;
      } catch (e) {
        setError(e.shortMessage || e.reason || e.message);
        return false;
      }
    },
    [signer]
  );

  return (
    <WalletCtx.Provider value={{ account, signer, isOfficial, error, setError, connect, tx }}>
      {children}
    </WalletCtx.Provider>
  );
}

export const useWallet = () => useContext(WalletCtx);
