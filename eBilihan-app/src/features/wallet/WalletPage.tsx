import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Landmark, HandCoins, PiggyBank, Banknote, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, StatTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getWalletSummary } from "@/api/wallet";
import { listLoans } from "@/api/loans";
import { listOrders } from "@/api/orders";
import { LoanVerificationFlow } from "./LoanVerificationFlow";

export function WalletPage() {
  const queryClient = useQueryClient();
  const { data: summary } = useQuery({ queryKey: ["wallet-summary"], queryFn: getWalletSummary });
  const { data: loans = [] } = useQuery({ queryKey: ["loans"], queryFn: listLoans });
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: listOrders });
  const [newLoanOpen, setNewLoanOpen] = useState(false);

  const transactions = [...orders]
    .filter((o) => o.paymentStatus === "paid")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  function handleDialogChange(open: boolean) {
    setNewLoanOpen(open);
    if (!open) {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-summary"] });
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-bold text-brand-ink">Wallet Management</h1>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Assets" value={`₱${summary?.assets.toFixed(0) ?? "—"}`} tone="blue" icon={<Landmark />} />
        <StatTile label="Liabilities" value={`₱${summary?.liabilities.toFixed(0) ?? "—"}`} tone="red" icon={<HandCoins />} />
        <StatTile label="Equity" value={`₱${summary?.equity.toFixed(0) ?? "—"}`} tone="green" icon={<PiggyBank />} />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-brand-ink">Loans (Pautang)</h2>
          <Dialog open={newLoanOpen} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus /> New Loan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Loan</DialogTitle>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-y-auto">
                <LoanVerificationFlow />
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-2 flex flex-col gap-2">
          {loans.map((loan) => (
            <Card key={loan.id}>
              <CardContent className="flex items-center justify-between pt-4">
                <div>
                  <p className="font-medium">{loan.borrowerName}</p>
                  <p className="text-xs text-brand-ink/50">Balance: PHP {loan.balance.toFixed(2)} of {loan.principal.toFixed(2)}</p>
                </div>
                <Badge variant={loan.status === "active" ? "default" : loan.status === "paid" ? "success" : "danger"}>
                  {loan.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
          {loans.length === 0 && <p className="text-sm text-brand-ink/50">No loans yet.</p>}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-brand-ink">Transaction History</h2>
        <div className="flex flex-col gap-2">
          {transactions.slice(0, 8).map((order) => (
            <Card key={order.id}>
              <CardContent className="flex items-center gap-3 pt-4">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    order.paymentMethod === "cash" ? "bg-brand-gold-light text-green-700" : "bg-brand-blue-light text-brand-blue"
                  }`}
                >
                  {order.paymentMethod === "cash" ? <Banknote className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-brand-ink">{order.items.length} item(s)</p>
                  <p className="text-xs text-brand-ink/40">{new Date(order.createdAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-brand-ink">₱{order.total.toFixed(2)}</p>
                  <p className="text-[10px] font-semibold uppercase text-brand-ink/40">{order.paymentMethod === "cash" ? "Cash" : "eGovPay"}</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {transactions.length === 0 && <p className="text-sm text-brand-ink/50">No transactions yet.</p>}
        </div>
      </div>
    </div>
  );
}
