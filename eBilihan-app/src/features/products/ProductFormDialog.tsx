import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ScanLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createProduct, updateProduct, deleteProduct } from "@/api/products";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import type { Product } from "@/types";

const emptyForm = { name: "", type: "", boughtPrice: "", sellingPrice: "", quantity: "", barcode: "" };

type ProductFormDialogProps = {
  /** Omit for "New Product"; pass an existing product to edit/delete it. */
  product?: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Single form used for both creating a product and editing/deleting an existing one — tap a product row to edit. */
export function ProductFormDialog({ product, open, onOpenChange }: ProductFormDialogProps) {
  const queryClient = useQueryClient();
  const { scanOnce } = useBarcodeScanner();
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) {
      setForm(
        product
          ? {
              name: product.name,
              type: product.type,
              boughtPrice: String(product.boughtPrice),
              sellingPrice: String(product.sellingPrice),
              quantity: String(product.quantity),
              barcode: product.barcode,
            }
          : emptyForm,
      );
    }
  }, [open, product]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        type: form.type || "general",
        boughtPrice: Number(form.boughtPrice) || 0,
        sellingPrice: Number(form.sellingPrice),
        quantity: Number(form.quantity),
        barcode: form.barcode || undefined,
      };
      return product ? updateProduct(product.id, payload) : createProduct(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteProduct(product!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
    },
  });

  async function handleScanBarcode() {
    const barcode = await scanOnce("barcode");
    if (barcode) setForm((f) => ({ ...f, barcode }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? "Edit Product" : "New Product"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="type">Category</Label>
            <Input id="type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="e.g. beverage, snack" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="boughtPrice">Bought price</Label>
              <Input id="boughtPrice" type="number" value={form.boughtPrice} onChange={(e) => setForm({ ...form, boughtPrice: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="sellingPrice">Selling price</Label>
              <Input id="sellingPrice" type="number" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input id="quantity" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="barcode">Barcode</Label>
            <div className="flex gap-2">
              <Input id="barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Leave blank to generate one" />
              <Button type="button" variant="outline" size="icon" onClick={handleScanBarcode}>
                <ScanLine />
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            {product && (
              <Button type="button" variant="destructive" size="icon" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                <Trash2 />
              </Button>
            )}
            <Button
              className="flex-1"
              onClick={() => saveMutation.mutate()}
              disabled={!form.name || !form.sellingPrice || !form.quantity || saveMutation.isPending}
            >
              {product ? "Save Changes" : "Save Product"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
