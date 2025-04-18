export interface UserResponseDto {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

export interface GroupMemberResponseDto {
  id: string;
  user_id: string;
  group_id: string;
  joinedAt: string;
  user: UserResponseDto;
}

// GroupResponseDto remains the same
export interface GroupResponseDto {
  id: string;
  name: string;
  created_by_user_id: string;
  createdAt: string;
}

export interface CreateExpenseDto {
  description: string;
  amount: number;
  transaction_date: string; // YYYY-MM-DD format
}

export interface ExpenseResponseDto {
  id: string;
  group_id: string;
  paid_by_user_id: string;
  description: string;
  amount: number;
  transaction_date: string; // Comes as string (date part)
  createdAt: string; // Comes as ISO string
  paidBy: UserResponseDto; // Nested payer details
  // splits?: ExpenseSplitResponseDto[]; // Add later if needed
}

export interface BalanceResponseDto {
  user: UserResponseDto;
  netBalance: number; // Positive: User is owed; Negative: User owes
}

// Optional: Add ExpenseSplitResponseDto if you load splits
// export interface ExpenseSplitResponseDto { ... }
