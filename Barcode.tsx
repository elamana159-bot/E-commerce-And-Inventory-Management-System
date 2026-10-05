import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export interface BarcodeProps {
  value: string;
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  font?: string;
  textAlign?: string;
  textPosition?: string;
  textMargin?: number;
  fontSize?: number;
  background?: string;
  lineColor?: string;
  margin?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  className?: string;
}

export default function Barcode({
  value,
  format = "CODE128",
  width = 2,
  height = 100,
  displayValue = true,
  font = "monospace",
  textAlign = "center",
  textPosition = "bottom",
  textMargin = 2,
  fontSize = 20,
  background = "#ffffff",
  lineColor = "#000000",
  margin = 10,
  className,
}: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, String(value), {
          format,
          width,
          height,
          displayValue,
          font,
          textAlign,
          textPosition,
          textMargin,
          fontSize,
          background,
          lineColor,
          margin,
        });
      } catch (err) {
        console.warn("JsBarcode error:", err);
      }
    }
  }, [value, format, width, height, displayValue, font, textAlign, textPosition, textMargin, fontSize, background, lineColor, margin]);

  if (!value) return null;

  return <svg ref={svgRef} className={className} />;
}
