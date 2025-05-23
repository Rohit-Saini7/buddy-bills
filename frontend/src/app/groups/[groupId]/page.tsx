"use client";

import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/lib/apiClient";
import {
  BalanceResponseDto,
  CreateExpenseDto,
  CreatePaymentDto,
  ExpenseResponseDto,
  GroupMemberResponseDto,
  GroupResponseDto,
  MemberRemovalType,
  PaymentResponseDto,
  SplitType,
  UpdateGroupDto,
} from "@/types";
import EditExpenseModal from "@components/EditExpenseModal";
import ProtectedLayout from "@components/ProtectedLayout";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

//* --- Fetchers ---
const fetchGroup = (url: string) => apiClient.get<GroupResponseDto>(url);
const fetchMembers = (url: string) =>
  apiClient.get<GroupMemberResponseDto[]>(url);
const fetchExpenses = (url: string) => apiClient.get<ExpenseResponseDto[]>(url);
const fetchBalances = (url: string) => apiClient.get<BalanceResponseDto[]>(url);

export default function GroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = params.groupId as string;
  const { user: loggedInUser, isLoading: isAuthLoading } = useAuth();
  const { mutate } = useSWRConfig();

  //* --- State for Add Expense Form ---
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [addExpenseError, setAddExpenseError] = useState<string | null>(null);

  //* --- NEW State for Split Logic ---
  const [splitType, setSplitType] = useState<SplitType>(SplitType.EQUAL);

  const [splitInputs, setSplitInputs] = useState<{ [userId: string]: string }>(
    {}
  );

  //* --- State for Add Member Form (from previous step) ---
  const [memberEmail, setMemberEmail] = useState("");
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  //* --- State for Record Payment Form ---
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paidToUserId, setPaidToUserId] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [recordPaymentError, setRecordPaymentError] = useState<string | null>(
    null
  );

  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(
    null
  );
  const [deleteExpenseError, setDeleteExpenseError] = useState<string | null>(
    null
  );

  const [editingExpense, setEditingExpense] =
    useState<ExpenseResponseDto | null>(null);

  //* --- NEW State for Editing Group Name ---
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedGroupName, setEditedGroupName] = useState("");
  const [editNameError, setEditNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);

  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [removeMemberError, setRemoveMemberError] = useState<string | null>(
    null
  );
  const [isLeavingGroup, setIsLeavingGroup] = useState(false);
  const [leaveGroupError, setLeaveGroupError] = useState<string | null>(null);

  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [deleteGroupError, setDeleteGroupError] = useState<string | null>(null);

  //* --- SWR Hooks ---
  const allGroupsApiUrl = "/groups";
  const groupApiUrl = groupId ? `/groups/${groupId}` : null;
  const {
    data: group,
    error: groupError,
    isLoading: groupLoading,
  } = useSWR(groupApiUrl, fetchGroup);

  const membersApiUrl = groupId ? `/groups/${groupId}/members` : null;
  const {
    data: members,
    error: membersError,
    isLoading: membersLoading,
  } = useSWR(membersApiUrl, fetchMembers);

  const expensesApiUrl = groupId ? `/groups/${groupId}/expenses` : null;
  const {
    data: expenses,
    error: expensesError,
    isLoading: expensesLoading,
  } = useSWR(expensesApiUrl, fetchExpenses);

  const balancesApiUrl = groupId ? `/groups/${groupId}/balances` : null;
  const {
    data: balances,
    error: balancesError,
    isLoading: balancesLoading,
  } = useSWR(balancesApiUrl, fetchBalances);

  //* --- Calculated value for exact split validation ---
  const currentExactSplitTotal = Object.values(splitInputs).reduce(
    (sum, amountStr) => {
      const amount = parseFloat(amountStr);
      return sum + (isNaN(amount) ? 0 : amount);
    },
    0
  );

  const totalExpenseAmountNumber = parseFloat(expenseAmount);
  const remainingAmount = !isNaN(totalExpenseAmountNumber)
    ? totalExpenseAmountNumber - currentExactSplitTotal
    : 0;

  //* --- Helper calculations for validation display ---
  const percentageTotal = useMemo(() => {
    if (splitType !== SplitType.PERCENTAGE) return 0;
    return Object.values(splitInputs).reduce((sum, percentStr) => {
      const percent = parseFloat(percentStr);
      return sum + (isNaN(percent) ? 0 : percent);
    }, 0);
  }, [splitInputs, splitType]);

  const sharesTotal = useMemo(() => {
    if (splitType !== SplitType.SHARE) return 0;
    return Object.values(splitInputs).reduce((sum, shareStr) => {
      const share = parseFloat(shareStr);
      return sum + (isNaN(share) ? 0 : share);
    }, 0);
  }, [splitInputs, splitType]);

  const isValid = useMemo(() => {
    const amountNumber = parseFloat(expenseAmount);
    if (
      !expenseDescription.trim() ||
      isNaN(amountNumber) ||
      amountNumber <= 0 ||
      !expenseDate
    )
      return false;
    if (splitType === SplitType.EXACT) return Math.abs(remainingAmount) < 0.015;
    if (splitType === SplitType.PERCENTAGE)
      return Math.abs(percentageTotal - 100) < 0.01;
    if (splitType === SplitType.SHARE) return sharesTotal > 0;
    return true;
  }, [
    expenseDescription,
    expenseAmount,
    expenseDate,
    splitType,
    remainingAmount,
    percentageTotal,
    sharesTotal,
  ]);

  const isSettledUp = useMemo(() => {
    if (!balances || balances.length === 0) {
      return true;
    }
    const tolerance = 0.01;
    return balances.every(
      (balance) => Math.abs(balance.netBalance) < tolerance
    );
  }, [balances]);

  //* --- Handlers ---

  const handleAddMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!memberEmail.trim()) {
      setAddMemberError("Email cannot be empty.");
      return;
    }
    if (!groupId) return;
    setIsAddingMember(true);
    setAddMemberError(null);
    try {
      await apiClient.post<GroupMemberResponseDto>(
        `/groups/${groupId}/members`,
        { email: memberEmail }
      );
      setMemberEmail("");
      setIsAddingMember(false);

      mutate(membersApiUrl);
    } catch (error: any) {
      setAddMemberError(error.message || "Failed to add member.");
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleAddExpense = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountNumber = parseFloat(expenseAmount);
    setAddExpenseError(null);

    if (!isValid) {
      setAddExpenseError("Please check form inputs and split allocations.");
      return;
    }
    if (!groupId || !members) return;

    let expensePayload: Partial<CreateExpenseDto> = {
      description: expenseDescription,
      amount: amountNumber,
      transaction_date: expenseDate,
      split_type: splitType,
      splits: [],
    };

    const memberIds = members.map((m) => m.user.id);

    //* --- Construct splits array based on type ---
    if (splitType === SplitType.EQUAL) {
      delete expensePayload.splits;
    } else if (splitType === SplitType.EXACT) {
      expensePayload.splits = Object.entries(splitInputs)
        .map(([userId, amountStr]) => ({
          user_id: userId,
          amount: parseFloat(amountStr || "0"),
        }))
        .filter(
          (split) => split.amount > 0.005 && memberIds.includes(split.user_id)
        );

      if (expensePayload.splits.length === 0) {
        setAddExpenseError(
          `Exact splits must involve at least one positive amount.`
        );
        return;
      }
    } else if (splitType === SplitType.PERCENTAGE) {
      expensePayload.splits = Object.entries(splitInputs)
        .map(([userId, percentStr]) => ({
          user_id: userId,
          percentage: parseFloat(percentStr || "0"),
        }))
        .filter(
          (split) =>
            split.percentage &&
            split.percentage > 0.0001 &&
            memberIds.includes(split.user_id)
        );

      if (expensePayload.splits.length === 0) {
        setAddExpenseError(
          `Percentage splits must involve at least one positive percentage.`
        );
        return;
      }
    } else if (splitType === SplitType.SHARE) {
      expensePayload.splits = Object.entries(splitInputs)
        .map(([userId, shareStr]) => ({
          user_id: userId,
          shares: parseFloat(shareStr || "0"),
        }))
        .filter(
          (split) =>
            split.shares &&
            split.shares > 0.0001 &&
            memberIds.includes(split.user_id)
        );

      if (expensePayload.splits.length === 0) {
        setAddExpenseError(
          `Share splits must involve at least one positive share.`
        );
        return;
      }
    }

    setIsAddingExpense(true);

    try {
      await apiClient.post<ExpenseResponseDto>(
        `/groups/${groupId}/expenses`,
        expensePayload
      );

      setExpenseDescription("");
      setExpenseAmount("");
      setExpenseDate(new Date().toISOString().split("T")[0]);
      setSplitType(SplitType.EQUAL);
      setSplitInputs({});
      setAddExpenseError(null);

      mutate(expensesApiUrl);
      mutate(balancesApiUrl);
    } catch (error: any) {
      console.error("Failed to add expense:", error);
      setAddExpenseError(error.message || "Failed to add expense.");
    } finally {
      setIsAddingExpense(false);
    }
  };

  const handleSplitInputChange = (userId: string, value: string) => {
    if (value === "" || /^\d*\.?\d{0,4}$/.test(value)) {
      setSplitInputs((prev) => ({
        ...prev,
        [userId]: value,
      }));
    }
  };

  const handleRecordPayment = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    const amountNumber = parseFloat(paymentAmount);

    if (!paidToUserId) {
      setRecordPaymentError("Please select who you paid.");
      return;
    }
    if (!paymentAmount || isNaN(amountNumber) || amountNumber <= 0) {
      setRecordPaymentError("Please enter a valid positive amount.");
      return;
    }
    if (!groupId || !loggedInUser) return;

    setIsRecordingPayment(true);
    setRecordPaymentError(null);

    const paymentData: CreatePaymentDto = {
      amount: amountNumber,
      paid_to_user_id: paidToUserId,
      payment_date: paymentDate,
    };

    try {
      await apiClient.post<PaymentResponseDto>(
        `/groups/${groupId}/payments`,
        paymentData
      );

      setPaymentAmount("");
      setPaidToUserId("");
      setPaymentDate(new Date().toISOString().split("T")[0]);

      //* --- IMPORTANT: Revalidate balances ---
      mutate(balancesApiUrl);
    } catch (error: any) {
      console.error("Failed to record payment:", error);
      setRecordPaymentError(error.message || "Failed to record payment.");
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleDeleteExpense = useCallback(
    async (expenseId: string) => {
      if (
        !window.confirm(
          "Are you sure you want to delete this expense? This action cannot be undone."
        )
      ) {
        return;
      }

      setDeletingExpenseId(expenseId);
      setDeleteExpenseError(null);

      try {
        await apiClient.delete(`/expenses/${expenseId}`);

        mutate(expensesApiUrl);
        mutate(balancesApiUrl);
      } catch (error: any) {
        console.error("Failed to delete expense:", error);
        setDeleteExpenseError(`Failed to delete expense: ${error.message}`);
      } finally {
        setDeletingExpenseId(null);
      }
    },
    [groupId, mutate, expensesApiUrl, balancesApiUrl]
  );

  const handleEditNameClick = () => {
    if (group) {
      setEditedGroupName(group.name);
      setIsEditingName(true);
      setEditNameError(null);
    }
  };

  //* --- NEW Handler for Deleting Group ---
  const handleDeleteGroup = useCallback(async () => {
    if (!group) return;

    if (
      !window.confirm(
        `Are you sure you want to delete the group "${group.name}"? This action cannot be easily undone.`
      )
    ) {
      return;
    }

    setIsDeletingGroup(true);
    setDeleteGroupError(null);

    try {
      await apiClient.delete(`/groups/${group.id}`);

      alert(`Group "${group.name}" deleted successfully.`);

      mutate(allGroupsApiUrl);

      router.push("/dashboard");
    } catch (error: any) {
      console.error("Failed to delete group:", error);
      setDeleteGroupError(error.message || "Could not delete group.");

      setIsDeletingGroup(false);
    }
  }, [group, mutate, allGroupsApiUrl, router]);

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditNameError(null);
  };

  const handleSaveGroupName = async () => {
    if (!editedGroupName.trim()) {
      setEditNameError("Group name cannot be empty.");
      return;
    }
    if (!group || editedGroupName.trim() === group.name) {
      setIsEditingName(false);
      setEditNameError(null);
      return;
    }

    setIsSavingName(true);
    setEditNameError(null);

    try {
      const updateData: UpdateGroupDto = { name: editedGroupName.trim() };
      await apiClient.patch<GroupResponseDto>(
        `/groups/${group.id}`,
        updateData
      );

      mutate(groupApiUrl);

      setIsEditingName(false);
    } catch (error: any) {
      console.error("Failed to update group name:", error);
      setEditNameError(error.message || "Could not update group name.");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleRemoveMember = useCallback(
    async (memberUserIdToRemove: string) => {
      if (
        !window.confirm(
          "Are you sure you want to remove this member from the group?"
        )
      ) {
        return;
      }
      if (!groupId) return;

      setRemovingMemberId(memberUserIdToRemove);
      setRemoveMemberError(null);

      try {
        await apiClient.delete(
          `/groups/${groupId}/members/${memberUserIdToRemove}`
        );

        mutate(membersApiUrl);
        mutate(balancesApiUrl);
      } catch (error: any) {
        console.error("Failed to remove member:", error);
        setRemoveMemberError(`Failed to remove member: ${error.message}`);
      } finally {
        setRemovingMemberId(null);
      }
    },
    [groupId, mutate, membersApiUrl, balancesApiUrl]
  );

  const handleLeaveGroup = useCallback(async () => {
    if (
      !window.confirm(
        "Are you sure you want to leave this group? This action might not be reversible."
      )
    ) {
      return;
    }
    if (!groupId) return;

    setIsLeavingGroup(true);
    setLeaveGroupError(null);

    try {
      await apiClient.delete(`/groups/${groupId}/members/me`);

      mutate("/groups");

      router.push("/dashboard");
    } catch (error: any) {
      console.error("Failed to leave group:", error);
      setLeaveGroupError(`Failed to leave group: ${error.message}`);

      setIsLeavingGroup(false);
    }
  }, [groupId, mutate, router]);

  const isLoading = groupLoading || isAuthLoading;

  const otherMembers =
    members?.filter((m) => m.user.id !== loggedInUser?.id) || [];

  return (
    <ProtectedLayout>
      <div className="container mx-auto p-4">
        {/* Back Link */}
        <div className="mb-4">
          <Link href="/dashboard" className="text-blue-500 hover:underline">
            &larr; Back to Dashboard
          </Link>
        </div>

        {/* Group Details Loading/Error/Display */}
        {isLoading && <p>Loading group details...</p>}
        {groupError && (
          <div className="text-red-500 mb-4"> /* ... Error Display ... */ </div>
        )}

        {!isLoading && !groupError && group && (
          <div className="space-y-6">
            {loggedInUser?.id === group.created_by_user_id && (
              <div className="p-4 border border-red-300 rounded bg-red-50">
                <h3 className="text-lg font-semibold text-red-800 mb-2">
                  Danger Zone
                </h3>
                {!isSettledUp && (
                  <p className="text-sm text-yellow-800 bg-yellow-100 border border-yellow-300 p-2 rounded mb-3">
                    Cannot delete group: Balances are not fully settled. Ask
                    members to record payments first.
                  </p>
                )}
                <p className="text-sm text-red-700 mb-3">
                  Deleting the group will archive it for all members.
                </p>

                <button
                  onClick={handleDeleteGroup}
                  disabled={isDeletingGroup}
                  className="p-2 px-4 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeletingGroup ? "Deleting..." : "Delete This Group"}
                </button>
                {deleteGroupError && (
                  <p className="text-red-600 mt-2 text-sm">
                    {deleteGroupError}
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center space-x-3 mb-4">
              {isEditingName ? (
                //* --- Editing State ---
                <>
                  <input
                    type="text"
                    value={editedGroupName}
                    onChange={(e) => setEditedGroupName(e.target.value)}
                    className="flex-grow text-2xl font-bold p-1 border border-blue-300 rounded"
                    maxLength={100}
                    disabled={isSavingName}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveGroupName}
                    disabled={
                      isSavingName ||
                      !editedGroupName.trim() ||
                      editedGroupName.trim() === group.name
                    }
                    className="p-1 px-3 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
                  >
                    {isSavingName ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={handleCancelEditName}
                    disabled={isSavingName}
                    className="p-1 px-3 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold"> {group.name} </h1>
                  {loggedInUser?.id === group.created_by_user_id && (
                    <button
                      onClick={handleEditNameClick}
                      className="p-1 text-blue-500 rounded hover:bg-blue-100"
                      title="Edit Group Name"
                    >
                      {/* Edit Icon */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* --- Balances Section --- */}
            <div className="p-4 border rounded bg-white shadow-sm">
              <h2 className="text-lg font-semibold mb-3">Group Balances</h2>
              {balancesLoading && <p>Calculating balances...</p>}
              {balancesError && (
                <p className="text-red-500">
                  Error loading balances: {balancesError.message}
                </p>
              )}
              {!balancesLoading && !balancesError && balances && (
                <ul className="space-y-2">
                  {balances.length === 0 ? (
                    <p>No balances to show yet.</p>
                  ) : (
                    balances.map((balance) => {
                      const isCurrentUser =
                        balance.user.id === loggedInUser?.id;
                      const balanceAmount = Math.abs(balance.netBalance);
                      const isOwed = balance.netBalance > 0.005;
                      const owesMoney = balance.netBalance < -0.005;
                      const isSettled = !isOwed && !owesMoney;

                      let balanceText = "";
                      let textColor = "text-gray-600";

                      if (isSettled) {
                        balanceText = isCurrentUser
                          ? "You are settled up"
                          : `${balance.user.name || balance.user.email} is settled up`;
                      } else if (isOwed) {
                        balanceText = isCurrentUser
                          ? `You are owed ₹${balanceAmount.toFixed(2)}`
                          : `${balance.user.name || balance.user.email} is owed ₹${balanceAmount.toFixed(2)}`;
                        textColor = "text-green-600";
                      } else if (owesMoney) {
                        balanceText = isCurrentUser
                          ? `You owe ₹${balanceAmount.toFixed(2)}`
                          : `${balance.user.name || balance.user.email} owes ₹${balanceAmount.toFixed(2)}`;
                        textColor = "text-red-600";
                      }

                      return (
                        <li
                          key={balance.user.id}
                          className="flex items-center justify-between p-2 border-b last:border-b-0"
                        >
                          <div className="flex items-center space-x-3">
                            <img
                              src={
                                balance.user.avatar_url ||
                                `https://ui-avatars.com/api/?name=${encodeURIComponent(balance.user.name || balance.user.email)}&background=random`
                              }
                              alt={balance.user.name || balance.user.email}
                              className="w-8 h-8 rounded-full"
                            />
                            <span className="font-medium">
                              {isCurrentUser
                                ? "You"
                                : balance.user.name || balance.user.email}
                            </span>
                          </div>
                          <span className={`font-semibold ${textColor}`}>
                            {balanceText.replace(
                              `${balance.user.name || balance.user.email} `,
                              ""
                            )}
                            {/* Show only status text */}
                          </span>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
              {/* TODO: Add "Settle Up" button later */}
            </div>
            {/* --- Record Payment Section --- */}
            <div className="p-4 border rounded bg-white shadow-sm">
              <h2 className="text-lg font-semibold mb-3">Record a Payment</h2>
              <form onSubmit={handleRecordPayment} className="space-y-3">
                <p className="text-sm text-gray-600 mb-2">
                  Record a payment *you* made to someone else in this group.
                </p>
                <div className="flex flex-col sm:flex-row sm:space-x-2 space-y-3 sm:space-y-0">
                  <div className="flex-1">
                    <label
                      htmlFor="paidTo"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Who did you pay?
                    </label>
                    <select
                      id="paidTo"
                      value={paidToUserId}
                      onChange={(e) => setPaidToUserId(e.target.value)}
                      className="mt-1 block w-full p-2 border border-gray-300 rounded shadow-sm bg-white"
                      disabled={isRecordingPayment || otherMembers.length === 0}
                      required
                    >
                      <option value="" disabled>
                        Select member...
                      </option>
                      {otherMembers.map((member) => (
                        <option key={member.user.id} value={member.user.id}>
                          {member.user.name || member.user.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 sm:flex-none sm:w-32">
                    <label
                      htmlFor="paymentAmount"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Amount (₹)
                    </label>
                    <input
                      type="number"
                      id="paymentAmount"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="0.00"
                      required
                      step="0.01"
                      min="0.01"
                      className="mt-1 block w-full p-2 border border-gray-300 rounded shadow-sm"
                      disabled={isRecordingPayment}
                    />
                  </div>
                  <div className="flex-1 sm:flex-none sm:w-40">
                    <label
                      htmlFor="paymentDate"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Date
                    </label>
                    <input
                      type="date"
                      id="paymentDate"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      required
                      className="mt-1 block w-full p-2 border border-gray-300 rounded shadow-sm"
                      disabled={isRecordingPayment}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full sm:w-auto p-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
                  disabled={
                    isRecordingPayment || !paidToUserId || !paymentAmount
                  }
                >
                  {isRecordingPayment ? "Recording..." : "Record Payment"}
                </button>
                {recordPaymentError && (
                  <p className="text-red-500 mt-2 text-sm">
                    {recordPaymentError}
                  </p>
                )}
              </form>
            </div>
            {/* --- Add Expense Section --- */}
            <div className="p-4 border rounded bg-white shadow-sm">
              <h2 className="text-lg font-semibold mb-3">Add New Expense</h2>
              <form onSubmit={handleAddExpense} className="space-y-4">
                <div>
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Description
                  </label>
                  <input
                    type="text"
                    id="description"
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    placeholder="What was this for?"
                    required
                    maxLength={255}
                    className="mt-1 block w-full p-2 border border-gray-300 rounded shadow-sm"
                    disabled={isAddingExpense}
                  />
                </div>
                <div className="flex space-x-2">
                  <div className="flex-1">
                    <label
                      htmlFor="amount"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Total Amount(₹)
                    </label>
                    <input
                      type="number"
                      id="amount"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder="0.00"
                      required
                      step="0.01"
                      min="0.01"
                      className="mt-1 block w-full p-2 border border-gray-300 rounded shadow-sm"
                      disabled={isAddingExpense}
                    />
                  </div>
                  <div className="flex-1">
                    <label
                      htmlFor="date"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Date
                    </label>
                    <input
                      type="date"
                      id="date"
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      required
                      className="mt-1 block w-full p-2 border border-gray-300 rounded shadow-sm"
                      disabled={isAddingExpense}
                    />
                  </div>
                </div>

                {/* --- Split Method Selector --- */}
                <div>
                  <label
                    htmlFor="splitType"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Split Method
                  </label>
                  <select
                    id="splitType"
                    value={splitType}
                    onChange={(e) => setSplitType(e.target.value as SplitType)}
                    className="mt-1 block w-full p-2 border border-gray-300 rounded shadow-sm bg-white"
                    disabled={isAddingExpense}
                  >
                    <option value={SplitType.EQUAL}>
                      Split Equally(among all members)
                    </option>
                    <option value={SplitType.EXACT}>
                      Split by Exact Amounts
                    </option>
                    <option value={SplitType.PERCENTAGE}>
                      Split by Percentage
                    </option>
                    <option value={SplitType.SHARE}> Split by Shares </option>
                  </select>
                </div>

                {/* --- Conditional Inputs for EXACT Split --- */}
                {splitType === SplitType.EXACT && (
                  <div className="space-y-2 pt-2 border-t mt-3">
                    <h3 className="text-md font-medium text-gray-800">
                      Enter Exact Amounts Owed:
                    </h3>
                    {membersLoading && <p>Loading members...</p>}
                    {membersError && (
                      <p className="text-red-500">
                        Error loading members for split.
                      </p>
                    )}
                    {members &&
                      members.map((member) => (
                        <div
                          key={member.user.id}
                          className="flex items-center justify-between space-x-2"
                        >
                          <label
                            htmlFor={`split-${member.user.id}`}
                            className="flex-grow text-sm text-gray-600"
                          >
                            {member.user.name || member.user.email}
                            {member.user.id === loggedInUser?.id
                              ? " (You)"
                              : ""}
                          </label>
                          <input
                            type="number"
                            id={`split-${member.user.id}`}
                            value={splitInputs[member.user.id] || ""}
                            onChange={(e) =>
                              handleSplitInputChange(
                                member.user.id,
                                e.target.value
                              )
                            }
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            className="p-1 border rounded w-24 text-right"
                            disabled={isAddingExpense}
                          />
                        </div>
                      ))}
                    {/* Display sum validation helper */}
                    <div
                      className={`mt-2 text-sm font-medium ${Math.abs(remainingAmount) < 0.015 ? "text-green-600" : "text-red-600"}`}
                    >
                      Total Assigned: ₹{currentExactSplitTotal.toFixed(2)} / ₹
                      {(totalExpenseAmountNumber || 0).toFixed(2)}
                      (Remaining: ₹{remainingAmount.toFixed(2)})
                    </div>
                  </div>
                )}

                {/* --- Conditional Inputs for PERCENTAGE Split --- */}
                {splitType === SplitType.PERCENTAGE && (
                  <div className="space-y-2 pt-3 border-t mt-4">
                    <h3 className="text-md font-medium text-gray-800">
                      Enter Percentages:
                    </h3>
                    {membersLoading && <p>Loading members...</p>}
                    {membersError && (
                      <p className="text-red-500">Error loading members.</p>
                    )}
                    {members &&
                      members.map((member) => (
                        <div
                          key={member.user.id}
                          className="flex items-center justify-between space-x-2"
                        >
                          <label
                            htmlFor={`split-${member.user.id}`}
                            className="flex-grow text-sm text-gray-600 truncate"
                            title={member.user.name || member.user.email}
                          >
                            {member.user.name || member.user.email}{" "}
                            {member.user.id === loggedInUser?.id
                              ? " (You)"
                              : ""}
                          </label>
                          <div className="flex items-center">
                            <input
                              type="number"
                              id={`split-${member.user.id}`}
                              value={splitInputs[member.user.id] || ""}
                              onChange={(e) =>
                                handleSplitInputChange(
                                  member.user.id,
                                  e.target.value
                                )
                              }
                              placeholder="0"
                              step="0.01"
                              min="0"
                              max="100"
                              className="p-1 border rounded w-20 text-right"
                              disabled={isAddingExpense}
                            />
                            <span className="ml-1 text-gray-500 text-sm">
                              %
                            </span>
                          </div>
                        </div>
                      ))}
                    {/* Display percentage sum validation helper */}
                    <div
                      className={`mt-2 text-sm font-medium ${Math.abs(percentageTotal - 100) < 0.01 ? "text-green-600" : "text-red-600"}`}
                    >
                      Total Assigned: {percentageTotal.toFixed(2)}% / 100%
                    </div>
                  </div>
                )}

                {/* --- Conditional Inputs for SHARE Split --- */}
                {splitType === SplitType.SHARE && (
                  <div className="space-y-2 pt-3 border-t mt-4">
                    <h3 className="text-md font-medium text-gray-800">
                      Enter Shares:
                    </h3>
                    {membersLoading && <p>Loading members...</p>}
                    {membersError && (
                      <p className="text-red-500">Error loading members.</p>
                    )}
                    {members &&
                      members.map((member) => (
                        <div
                          key={member.user.id}
                          className="flex items-center justify-between space-x-2"
                        >
                          <label
                            htmlFor={`split-${member.user.id}`}
                            className="flex-grow text-sm text-gray-600 truncate"
                            title={member.user.name || member.user.email}
                          >
                            {member.user.name || member.user.email}{" "}
                            {member.user.id === loggedInUser?.id
                              ? " (You)"
                              : ""}
                          </label>
                          <input
                            type="number"
                            id={`split-${member.user.id}`}
                            value={splitInputs[member.user.id] || ""}
                            onChange={(e) =>
                              handleSplitInputChange(
                                member.user.id,
                                e.target.value
                              )
                            }
                            placeholder="0"
                            step="0.1"
                            min="0"
                            className="p-1 border rounded w-20 text-right"
                            disabled={isAddingExpense}
                          />
                        </div>
                      ))}
                    {/* Display total shares */}
                    <div className="mt-2 text-sm font-medium text-gray-700">
                      Total Shares Assigned: {sharesTotal.toFixed(2)}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                  disabled={isAddingExpense || !isValid}
                >
                  {isAddingExpense ? "Adding..." : "Add Expense"}
                </button>
                {addExpenseError && (
                  <p className="text-red-500 mt-2 text-sm">{addExpenseError}</p>
                )}
              </form>
            </div>
            {/* --- Expenses List Section --- */}
            <div className="p-4 border rounded bg-white shadow-sm">
              <h2 className="text-lg font-semibold mb-3">Expenses</h2>
              {/* Display general delete error if any */}
              {deleteExpenseError && (
                <p className="text-red-500 mb-2 text-sm">
                  {deleteExpenseError}
                </p>
              )}

              {expensesLoading && <p>Loading expenses...</p>}
              {expensesError && (
                <p className="text-red-500">
                  Error loading expenses: {expensesError.message}
                </p>
              )}
              {!expensesLoading && !expensesError && expenses && (
                <ul className="space-y-3">
                  {expenses.length === 0 ? (
                    <p>No expenses added to this group yet.</p>
                  ) : (
                    expenses.map((expense) => (
                      <li
                        key={expense.id}
                        className={`p-3 border-b flex justify-between items-center group hover:bg-gray-50 ${
                          expense.deletedAt ? "opacity-50" : ""
                        }`}
                      >
                        {/* Added group class for hover effect */}
                        {/* Expense Details */}
                        <div
                          className={`${
                            expense.deletedAt
                              ? "line-through text-gray-400"
                              : ""
                          }`}
                        >
                          <p className="font-medium">{expense.description}</p>
                          <p className="text-sm text-gray-500">
                            Paid by&nbsp;
                            {expense.paidBy?.id === loggedInUser?.id
                              ? "You"
                              : expense.paidBy?.name ||
                                expense.paidBy?.email ||
                                "Unknown"}
                            &nbsp;on&nbsp;
                            {new Date(
                              expense.transaction_date + "T00:00:00"
                            ).toLocaleDateString()}
                          </p>
                        </div>
                        {/* Amount and Delete Button */}
                        <div className="flex items-center space-x-3">
                          <span
                            className={`font-semibold text-lg ${
                              expense.deletedAt
                                ? "line-through text-gray-400"
                                : ""
                            }`}
                          >
                            ₹{expense.amount.toFixed(2)}
                          </span>

                          {/* --- Edit Button --- */}
                          {!expense.deletedAt &&
                            expense.paidBy?.id === loggedInUser?.id && (
                              <button
                                onClick={() => setEditingExpense(expense)}
                                className="p-1 text-blue-500 rounded hover:bg-blue-100"
                                title="Edit Expense"
                                aria-label={`Edit expense: ${expense.description}`}
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-5 w-5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                  />
                                </svg>
                              </button>
                            )}
                          {/* Delete Button */}
                          {!expense.deletedAt &&
                            expense.paidBy?.id === loggedInUser?.id && (
                              <button
                                onClick={() => handleDeleteExpense(expense.id)}
                                disabled={deletingExpenseId === expense.id}
                                className={`p-1 text-red-500 rounded hover:bg-red-100 disabled:opacity-50 ${deletingExpenseId === expense.id ? "animate-pulse" : ""}`}
                                title="Delete Expense"
                                aria-label={`Delete expense: ${expense.description}`}
                              >
                                {deletingExpenseId === expense.id ? (
                                  <span className="text-xs">Deleting...</span>
                                ) : (
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                )}
                              </button>
                            )}
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
            {/* --- Members Section (from previous step) --- */}
            <div className="p-4 border rounded bg-white shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-semibold">Members</h2>
                {/* --- Leave Group Button --- */}
                {loggedInUser?.id !== group.created_by_user_id &&
                  members?.find(
                    (m) => m.user.id === loggedInUser?.id && !m.deletedAt
                  ) && (
                    <button
                      onClick={handleLeaveGroup}
                      disabled={isLeavingGroup}
                      className="p-1 px-3 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                    >
                      {isLeavingGroup ? "Leaving..." : "Leave Group"}
                    </button>
                  )}
              </div>
              {leaveGroupError && (
                <p className="text-red-500 mb-2 text-sm">{leaveGroupError}</p>
              )}
              {removeMemberError && (
                <p className="text-red-500 mb-2 text-sm">{removeMemberError}</p>
              )}

              {membersLoading && <p>Loading members...</p>}
              {membersError && (
                <p className="text-red-500">
                  Error loading members: {membersError.message}
                </p>
              )}
              {!membersLoading && !membersError && members && (
                <ul className="space-y-2 mb-4">
                  {members.length === 0 ? (
                    <p>No members found.</p>
                  ) : (
                    members.map((member) => {
                      const isCreator =
                        member.user.id === group.created_by_user_id;
                      const isCurrentUser = member.user.id === loggedInUser?.id;
                      const isInactive = !!member.deletedAt;
                      const canRemove =
                        loggedInUser?.id === group.created_by_user_id &&
                        !isCreator &&
                        !isInactive;

                      let statusText = "";
                      if (isInactive) {
                        const date = new Date(
                          member.deletedAt!
                        ).toLocaleDateString();
                        if (
                          member.removalType ===
                          MemberRemovalType.LEFT_VOLUNTARILY
                        ) {
                          statusText = `(Left on ${date})`;
                        } else if (
                          member.removalType ===
                          MemberRemovalType.REMOVED_BY_CREATOR
                        ) {
                          statusText = `(Removed on ${date})`;
                        } else {
                          statusText = `(Inactive since ${date})`;
                        }
                      }

                      return (
                        <li
                          key={member.id}
                          className={`flex items-center justify-between space-x-3 p-2 border-b last:border-b-0 ${
                            isInactive ? "opacity-50" : ""
                          }`}
                        >
                          {/* Member Info */}
                          <div className="flex items-center space-x-3 flex-grow min-w-0">
                            {" "}
                            {/* Ensure content doesn't push button out */}
                            <img
                              src={
                                member.user.avatar_url ||
                                `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                  member.user.name || member.user.email
                                )}&background=random`
                              }
                              alt={member.user.name || member.user.email}
                              className="w-8 h-8 rounded-full flex-shrink-0"
                            />
                            <div className="min-w-0">
                              <span
                                className={`font-medium ${
                                  isInactive ? "line-through" : ""
                                } truncate block`}
                              >
                                {member.user.name || "Unnamed User"}
                              </span>
                              <span
                                className={`text-sm text-gray-500 ${
                                  isInactive ? "line-through" : ""
                                } truncate block`}
                              >
                                {member.user.email}
                              </span>
                              {isCreator && !isInactive && (
                                <span className="text-xs text-blue-600 font-semibold">
                                  {" "}
                                  (Creator)
                                </span>
                              )}
                              {isInactive && (
                                <span className="text-xs text-gray-500 italic block">
                                  {statusText}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Remove Button */}
                          {canRemove && (
                            <button
                              onClick={() => handleRemoveMember(member.user.id)}
                              disabled={removingMemberId === member.user.id}
                              className="p-1 text-red-500 rounded hover:bg-red-100 disabled:opacity-50 flex-shrink-0"
                              title={`Remove ${
                                member.user.name || member.user.email
                              }`}
                              aria-label={`Remove ${
                                member.user.name || member.user.email
                              }`}
                            >
                              {removingMemberId === member.user.id ? (
                                <span className="text-xs">...</span>
                              ) : (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-5 w-5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
                                  />
                                </svg>
                              )}
                            </button>
                          )}
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
              {/* Add Member Form */}
              <form onSubmit={handleAddMember} className="mt-4 pt-4 border-t">
                <h3 className="text-md font-semibold mb-2">Add New Member</h3>
                <div className="flex space-x-2">
                  <input
                    type="email"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="Enter member's email"
                    className="flex-grow p-2 border rounded"
                    disabled={isAddingMember}
                    required
                  />
                  <button
                    type="submit"
                    className="p-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                    disabled={isAddingMember || !memberEmail.trim()}
                  >
                    {isAddingMember ? "Adding..." : "Add Member"}
                  </button>
                </div>
                {addMemberError && (
                  <p className="text-red-500 mt-2">{addMemberError}</p>
                )}
              </form>
            </div>
          </div>
        )}
        {/* --- Conditionally Render Edit Modal --- */}
        {editingExpense && (
          <EditExpenseModal
            expense={editingExpense}
            members={members || []}
            loggedInUserId={loggedInUser?.id || ""}
            onClose={() => setEditingExpense(null)}
            onSave={() => {
              mutate(expensesApiUrl);
              mutate(balancesApiUrl);
              setEditingExpense(null);
            }}
          />
        )}
      </div>
    </ProtectedLayout>
  );
}
