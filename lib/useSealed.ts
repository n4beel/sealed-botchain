"use client";

import { activeBotChain } from "@/lib/botchain/chain";
import { assertActiveChain, checkedWrite, waitSuccess } from "@/lib/useChainWrite";
import { usePublicClient, useWalletClient, useAccount } from "wagmi";
import { useCallback, useState } from "react";
import { parseEther, type Address } from "viem";
import { sealedAbi } from "./botchain/abi";
import { getContractAddress } from "./botchain/deployment";
import { decodeContractError } from "./errors";
import { commitmentFor, newSalt, saltStore, type StoredBid } from "./sealed";
import { useToast } from "@/components/ui/Toast";

export function useSealedContract() {
  const publicClient = usePublicClient({ chainId: activeBotChain.id }); // stable-hook-result
  const { data: walletClient } = useWalletClient(); // stable-hook-result
  const { address } = useAccount();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const contractAddress = getContractAddress() as Address;

  /**
   * Create a new auction lot
   */
  const createLot = useCallback(
    async (title: string, reserveEth: string, commitSecs: number, revealSecs: number) => {
      if (!walletClient || !publicClient) {
        toast("error", "Please connect your wallet first.");
        return null;
      }
      setLoading(true);
      try {
        const reserveWei = parseEther(reserveEth);
        const { request } = await publicClient.simulateContract({
          account: walletClient.account,
          address: contractAddress,
          abi: sealedAbi,
          functionName: "create",
          args: [title, reserveWei, BigInt(commitSecs), BigInt(revealSecs)],
        });

        await assertActiveChain(walletClient);

        const hash = await checkedWrite(walletClient, publicClient, request);
        const receipt = await waitSuccess(publicClient, hash);
        toast("success", "Lot inscribed on the gallery wall.");
        return receipt;
      } catch (err) {
        toast("error", decodeContractError(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [walletClient, publicClient, contractAddress, toast]
  );

  /**
   * Commit a sealed bid with generated salt and local storage
   */
  const commitBid = useCallback(
    async (
      id: bigint,
      amountEth: string,
      depositEth: string,
      salt: `0x${string}`,
      onStored?: (bid: StoredBid) => void
    ) => {
      if (!walletClient || !publicClient || !address) {
        toast("error", "Please connect your wallet first.");
        return null;
      }

      if (!saltStore.isAvailable()) {
        toast("error", "Browser storage unavailable. Bids require local storage to preserve your secret salt.");
        return null;
      }

      setLoading(true);
      try {
        const amountWei = parseEther(amountEth);
        const depositWei = parseEther(depositEth);
        const commitment = commitmentFor(id, address, amountWei, salt);

        const storedBid: StoredBid = {
          id: String(id),
          bidder: address,
          amount: amountWei.toString(),
          deposit: depositWei.toString(),
          salt,
          commitment,
          createdAt: Date.now(),
        };

        // Store salt BEFORE wallet prompt
        saltStore.put(storedBid);
        if (onStored) onStored(storedBid);

        const { request } = await publicClient.simulateContract({
          account: walletClient.account,
          address: contractAddress,
          abi: sealedAbi,
          functionName: "commit",
          args: [id, commitment],
          value: depositWei,
        });

        await assertActiveChain(walletClient);

        const hash = await checkedWrite(walletClient, publicClient, request);
        const receipt = await waitSuccess(publicClient, hash);
        toast("success", "Sealed bid placed. Your secret salt is stored safely.");
        return receipt;
      } catch (err) {
        toast("error", decodeContractError(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [walletClient, publicClient, address, contractAddress, toast]
  );

  /**
   * Reveal a previously committed sealed bid
   */
  const revealBid = useCallback(
    async (id: bigint, amountEth: string, salt: `0x${string}`) => {
      if (!walletClient || !publicClient) {
        toast("error", "Please connect your wallet first.");
        return null;
      }
      setLoading(true);
      try {
        const amountWei = parseEther(amountEth);
        const { request } = await publicClient.simulateContract({
          account: walletClient.account,
          address: contractAddress,
          abi: sealedAbi,
          functionName: "reveal",
          args: [id, amountWei, salt],
        });

        await assertActiveChain(walletClient);

        const hash = await checkedWrite(walletClient, publicClient, request);
        const receipt = await waitSuccess(publicClient, hash);
        toast("success", "Sealed bid revealed successfully.");
        return receipt;
      } catch (err) {
        toast("error", decodeContractError(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [walletClient, publicClient, contractAddress, toast]
  );

  /**
   * Settle an ended auction
   */
  const settleLot = useCallback(
    async (id: bigint) => {
      if (!walletClient || !publicClient) {
        toast("error", "Please connect your wallet first.");
        return null;
      }
      setLoading(true);
      try {
        const { request } = await publicClient.simulateContract({
          account: walletClient.account,
          address: contractAddress,
          abi: sealedAbi,
          functionName: "settle",
          args: [id],
        });

        await assertActiveChain(walletClient);

        const hash = await checkedWrite(walletClient, publicClient, request);
        const receipt = await waitSuccess(publicClient, hash);
        toast("success", "Auction settled.");
        return receipt;
      } catch (err) {
        toast("error", decodeContractError(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [walletClient, publicClient, contractAddress, toast]
  );

  /**
   * Claim deposit refunds or winnings
   */
  const claimRefund = useCallback(
    async (id: bigint) => {
      if (!walletClient || !publicClient) {
        toast("error", "Please connect your wallet first.");
        return null;
      }
      setLoading(true);
      try {
        const { request } = await publicClient.simulateContract({
          account: walletClient.account,
          address: contractAddress,
          abi: sealedAbi,
          functionName: "claim",
          args: [id],
        });

        await assertActiveChain(walletClient);

        const hash = await checkedWrite(walletClient, publicClient, request);
        const receipt = await waitSuccess(publicClient, hash);
        toast("success", "Claim credited to your pending till.");
        return receipt;
      } catch (err) {
        toast("error", decodeContractError(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [walletClient, publicClient, contractAddress, toast]
  );

  /**
   * Cancel an auction with no bids
   */
  const cancelLot = useCallback(
    async (id: bigint) => {
      if (!walletClient || !publicClient) {
        toast("error", "Please connect your wallet first.");
        return null;
      }
      setLoading(true);
      try {
        const { request } = await publicClient.simulateContract({
          account: walletClient.account,
          address: contractAddress,
          abi: sealedAbi,
          functionName: "cancel",
          args: [id],
        });

        await assertActiveChain(walletClient);

        const hash = await checkedWrite(walletClient, publicClient, request);
        const receipt = await waitSuccess(publicClient, hash);
        toast("success", "Lot withdrawn from wall.");
        return receipt;
      } catch (err) {
        toast("error", decodeContractError(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [walletClient, publicClient, contractAddress, toast]
  );

  /**
   * Withdraw pending balance from pull payment till
   */
  const withdraw = useCallback(async () => {
    if (!walletClient || !publicClient) {
      toast("error", "Please connect your wallet first.");
      return null;
    }
    setLoading(true);
    try {
      const { request } = await publicClient.simulateContract({
        account: walletClient.account,
        address: contractAddress,
        abi: sealedAbi,
        functionName: "withdraw",
      });

      await assertActiveChain(walletClient);

      const hash = await checkedWrite(walletClient, publicClient, request);
      const receipt = await waitSuccess(publicClient, hash);
      toast("success", "Withdrawn successfully to your wallet.");
      return receipt;
    } catch (err) {
      toast("error", decodeContractError(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletClient, publicClient, contractAddress, toast]);

  return {
    loading,
    createLot,
    commitBid,
    revealBid,
    settleLot,
    claimRefund,
    cancelLot,
    withdraw,
  };
}
