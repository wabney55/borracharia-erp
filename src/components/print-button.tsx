"use client";

import { Printer } from "lucide-react";
export function PrintButton() { return <button className="button button-quiet" onClick={() => window.print()} type="button"><Printer size={15} /> Imprimir</button>; }
