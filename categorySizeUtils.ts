import type { Category, CartonSizeItem, CartonCategorySummary } from "@/types";
import { generateConsecutiveSizes } from "@/components/ProductSizeRangeSelector";

/**
 * Checks if a size string/number fits within a category's size boundary
 */
export function isSizeInCategory(size: string, category: Category): boolean {
  if (!category) return false;

  const trimmed = size.trim().toLowerCase();

  // 1. Exact list match if category has explicit sizes array
  if (category.sizes && category.sizes.length > 0) {
    if (category.sizes.some(s => s.trim().toLowerCase() === trimmed)) {
      return true;
    }
  }

  // 2. Numeric range comparison if minSize and maxSize are defined
  const numSize = parseFloat(trimmed);
  const minNum = category.minSize !== undefined && category.minSize !== "" ? parseFloat(String(category.minSize)) : NaN;
  const maxNum = category.maxSize !== undefined && category.maxSize !== "" ? parseFloat(String(category.maxSize)) : NaN;

  if (!isNaN(numSize)) {
    if (!isNaN(minNum) && !isNaN(maxNum)) {
      return numSize >= Math.min(minNum, maxNum) && numSize <= Math.max(minNum, maxNum);
    }
    if (!isNaN(minNum) && isNaN(maxNum)) {
      return numSize >= minNum;
    }
    if (isNaN(minNum) && !isNaN(maxNum)) {
      return numSize <= maxNum;
    }
  }

  // 3. Size range string pattern match (e.g. "39-45" or "36-41")
  if (category.sizeRange) {
    const match = category.sizeRange.trim().match(/^(\d+(?:\.\d+)?)\s*(?:-|–|—|to|እስከ)\s*(\d+(?:\.\d+)?)$/i);
    if (match && !isNaN(numSize)) {
      const s = parseFloat(match[1]);
      const e = parseFloat(match[2]);
      if (!isNaN(s) && !isNaN(e)) {
        return numSize >= Math.min(s, e) && numSize <= Math.max(s, e);
      }
    }
  }

  // 4. Text-based apparel match (e.g. "S", "M", "L", "XL")
  if (category.name) {
    const catLower = category.name.toLowerCase();
    if (catLower.includes(trimmed)) return true;
  }

  return false;
}

/**
 * Finds all categories that match a specific size, or returns the primary matching category.
 */
export function findCategoryForSize(size: string, categories: Category[], fallbackCategory?: Category | null): Category | null {
  if (!size) return fallbackCategory || null;

  // Search categories that explicitly have size constraints first
  const constrainedCats = categories.filter(c => 
    (c.sizes && c.sizes.length > 0) || 
    c.minSize !== undefined || 
    c.maxSize !== undefined || 
    Boolean(c.sizeRange)
  );

  for (const cat of constrainedCats) {
    if (isSizeInCategory(size, cat)) {
      return cat;
    }
  }

  // If no constrained category matches, check fallback or category name hints
  if (fallbackCategory) return fallbackCategory;
  return null;
}

/**
 * Automatically evaluates a list of sizes against all categories and finds:
 * 1. The best overall matching Category (e.g., if 80% of sizes are 39-45 -> "Men Shoes")
 * 2. The full breakdown of which sizes belong to which categories
 */
export function matchCategoriesForSizes(sizes: string[], categories: Category[]): {
  bestMatchCategory: Category | null;
  matchScore: number; // percentage of sizes matched (0-100)
  categoryMatches: {
    category: Category;
    matchedSizes: string[];
    count: number;
    percentage: number;
  }[];
} {
  if (!sizes || sizes.length === 0 || !categories || categories.length === 0) {
    return { bestMatchCategory: null, matchScore: 0, categoryMatches: [] };
  }

  const categoryMap = new Map<string, { category: Category; matchedSizes: string[] }>();

  // Initialize for all categories with size configs
  categories.forEach(cat => {
    categoryMap.set(cat.id, { category: cat, matchedSizes: [] });
  });

  // Track unmatched sizes
  const unmatchedSizes: string[] = [];

  sizes.forEach(sz => {
    let matched = false;
    for (const cat of categories) {
      if (isSizeInCategory(sz, cat)) {
        categoryMap.get(cat.id)?.matchedSizes.push(sz);
        matched = true;
      }
    }
    if (!matched) {
      unmatchedSizes.push(sz);
    }
  });

  const categoryMatches = Array.from(categoryMap.values())
    .filter(item => item.matchedSizes.length > 0)
    .map(item => ({
      category: item.category,
      matchedSizes: item.matchedSizes,
      count: item.matchedSizes.length,
      percentage: Math.round((item.matchedSizes.length / sizes.length) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const bestMatch = categoryMatches.length > 0 ? categoryMatches[0] : null;
  const matchScore = bestMatch ? bestMatch.percentage : 0;

  return {
    bestMatchCategory: bestMatch ? bestMatch.category : null,
    matchScore,
    categoryMatches,
  };
}

/**
 * Computes carton pieces breakdown per size and grouped by category.
 * E.g., for 50 pieces per carton across 7 sizes (38 to 44):
 * Divides 50 among the 7 sizes, and assigns each size to its category!
 */
export function calculateCartonBreakdown(
  sizes: string[],
  quantityPerCarton: number,
  categories: Category[] = [],
  selectedCategoryId?: string,
  customSizeCounts?: Record<string, number>
): {
  items: CartonSizeItem[];
  categorySummaries: CartonCategorySummary[];
  totalPieces: number;
  isCustom: boolean;
} {
  const qpc = Math.max(1, Number(quantityPerCarton) || 1);
  const cleanSizes = sizes.map(s => s.trim()).filter(Boolean);

  if (cleanSizes.length === 0) {
    const fallbackCat = categories.find(c => c.id === selectedCategoryId);
    return {
      items: [{
        size: "Standard",
        count: qpc,
        categoryId: fallbackCat?.id,
        categoryName: fallbackCat?.name || "Standard",
        percentage: 100,
      }],
      categorySummaries: [{
        categoryId: fallbackCat?.id,
        categoryName: fallbackCat?.name || "Standard",
        count: qpc,
        percentage: 100,
        sizes: ["Standard"],
      }],
      totalPieces: qpc,
      isCustom: false,
    };
  }

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);
  const numSizes = cleanSizes.length;

  // Check if custom counts were supplied
  let hasValidCustom = false;
  if (customSizeCounts && Object.keys(customSizeCounts).length > 0) {
    const customSum = cleanSizes.reduce((acc, s) => acc + (customSizeCounts[s] || 0), 0);
    if (customSum === qpc) {
      hasValidCustom = true;
    }
  }

  // Calculate pieces per size
  let rawCounts: number[] = [];
  if (hasValidCustom && customSizeCounts) {
    rawCounts = cleanSizes.map(s => customSizeCounts[s] || 0);
  } else {
    // Distribute evenly with remainder assigned to middle/popular sizes
    const baseCount = Math.floor(qpc / numSizes);
    const remainder = qpc % numSizes;
    rawCounts = new Array(numSizes).fill(baseCount);

    // Distribute remainder starting from the center outward (or left to right)
    const mid = Math.floor(numSizes / 2);
    let remLeft = remainder;
    let offset = 0;
    while (remLeft > 0 && offset < numSizes) {
      const idx1 = mid + offset;
      if (idx1 < numSizes && remLeft > 0) {
        rawCounts[idx1] += 1;
        remLeft--;
      }
      const idx2 = mid - offset;
      if (idx2 >= 0 && idx2 !== idx1 && remLeft > 0) {
        rawCounts[idx2] += 1;
        remLeft--;
      }
      offset++;
    }
  }

  // Build CartonSizeItem list with category mapping
  const items: CartonSizeItem[] = cleanSizes.map((sz, idx) => {
    const count = rawCounts[idx] || 0;
    const cat = findCategoryForSize(sz, categories, selectedCategory);
    return {
      size: sz,
      count,
      categoryId: cat?.id || selectedCategoryId,
      categoryName: cat?.name || selectedCategory?.name || "General",
      percentage: qpc > 0 ? Math.round((count / qpc) * 100) : 0,
    };
  });

  // Group by Category
  const catGroupMap = new Map<string, CartonCategorySummary>();
  items.forEach(it => {
    const catKey = it.categoryId || it.categoryName || "unknown";
    const existing = catGroupMap.get(catKey);
    if (existing) {
      existing.count += it.count;
      existing.sizes = [...(existing.sizes || []), it.size];
    } else {
      catGroupMap.set(catKey, {
        categoryId: it.categoryId,
        categoryName: it.categoryName || "General",
        count: it.count,
        percentage: 0,
        sizes: [it.size],
      });
    }
  });

  const categorySummaries = Array.from(catGroupMap.values()).map(summary => ({
    ...summary,
    percentage: qpc > 0 ? Math.round((summary.count / qpc) * 100) : 0,
  }));

  const totalCalculated = items.reduce((acc, it) => acc + it.count, 0);

  return {
    items,
    categorySummaries,
    totalPieces: totalCalculated,
    isCustom: hasValidCustom,
  };
}

/**
 * Formats carton breakdown into a compact string representation e.g. "38:7, 39:7, 40:8, 41:7, 42:7, 43:7, 44:7 (50 pcs/ctn)"
 */
export function formatCartonBreakdownSummary(items?: CartonSizeItem[]): string {
  if (!items || items.length === 0) return "";
  return items.map(it => `${it.size}:${it.count}`).join(", ");
}
