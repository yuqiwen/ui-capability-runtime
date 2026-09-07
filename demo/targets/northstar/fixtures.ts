export type AccountType = "checking" | "savings";

export interface FictionalAccount {
  type: AccountType;
  maskedNumber: string;
  availableBalance: number;
}

export interface FictionalMember {
  id: string;
  name: string;
  status: "Active";
  accounts: FictionalAccount[];
}

export const fictionalMembers: Record<string, FictionalMember> = {
  "M-10042": {
    id: "M-10042",
    name: "Ava Patel",
    status: "Active",
    accounts: [
      { type: "checking", maskedNumber: "••••1044", availableBalance: 8_450.12 },
      { type: "savings", maskedNumber: "••••7782", availableBalance: 12_004.73 },
    ],
  },
  "M-20081": {
    id: "M-20081",
    name: "Jordan Lee",
    status: "Active",
    accounts: [
      { type: "checking", maskedNumber: "••••5521", availableBalance: 500 },
      { type: "savings", maskedNumber: "••••0194", availableBalance: 2_500.25 },
    ],
  },
  "M-30077": {
    id: "M-30077",
    name: "Morgan Rivera",
    status: "Active",
    accounts: [
      { type: "checking", maskedNumber: "••••6110", availableBalance: 1_280.8 },
      { type: "savings", maskedNumber: "••••4429", availableBalance: 9_104.11 },
    ],
  },
};

