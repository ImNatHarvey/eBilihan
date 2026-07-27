import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getWalletSummary } from "@/api/wallet";
import { listLoans } from "@/api/loans";
import { LoanVerificationFlow } from "./LoanVerificationFlow";

const CHART_COLORS = ["#0241e8", "#e9c400", "#a80e13"];

export function WalletPage() {
  const queryClient = useQueryClient();
  const { data: summary } = useQuery({ queryKey: ["wallet-summary"], queryFn: getWalletSummary });
  const { data: loans = [] } = useQuery({ queryKey: ["loans"], queryFn: listLoans });
  const [newLoanOpen, setNewLoanOpen] = useState(false);

  const chartData = summary
    ? [
        { name: "Cash Collected", value: summary.cashCollected },
        { name: "Outstanding Loans", value: summary.outstandingLoans },
      ]
    : [];

  function handleDialogChange(open: boolean) {
    setNewLoanOpen(open);
    if (!open) {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-summary"] });
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Wallet</h1>

      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-brand-ink/50">Assets</p>
            <p className="text-lg font-semibold">₱{summary?.assets.toFixed(0) ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-brand-ink/50">Liabilities</p>
            <p className="text-lg font-semibold">₱{summary?.liabilities.toFixed(0) ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-brand-ink/50">Equity</p>
            <p className="text-lg font-semibold">₱{summary?.equity.toFixed(0) ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      {summary && summary.chainEntryCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cash vs. Outstanding Loans</CardTitle>
          </CardHeader>
          <CardContent className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `₱${Number(value).toFixed(2)}`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-medium">Loans (Pautang)</h2>
        <Dialog open={newLoanOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus /> New Loan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Loan</DialogTitle>
            </DialogHeader>
            <LoanVerificationFlow />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col gap-2">
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
  );
}
