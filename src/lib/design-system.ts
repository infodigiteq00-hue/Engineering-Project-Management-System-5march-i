// Design System - Centralized rules for consistent UI across the platform

export const designSystem = {
  // Typography Scale
  typography: {
    h1: "text-3xl font-bold text-gray-800",           // Main page titles
    h2: "text-2xl font-bold text-gray-800",           // Section headings (Projects Overview, Key Updates, etc.)
    h3: "text-lg font-semibold text-white",           // Card titles (white for gradient backgrounds)
    body: "text-sm text-gray-600",                    // Regular text
    bodySmall: "text-xs text-gray-600",               // Small text
    label: "text-sm font-medium text-gray-700",       // Form labels
    button: "text-sm font-medium",                    // Button text
  },

  // Spacing Scale
  spacing: {
    section: "mb-8",                                  // Space between major sections
    component: "mb-6",                                // Space between components
    element: "mb-4",                                  // Space between elements
    small: "mb-2",                                    // Small spacing
    padding: "p-6",                                   // Standard padding
    paddingSmall: "p-4",                              // Small padding
  },

  // Colors
  colors: {
    primary: "text-gray-800",                         // Primary text color
    secondary: "text-gray-600",                       // Secondary text color
    accent: "text-blue-600",                          // Accent color
    background: "bg-gray-50",                         // Section background
    white: "bg-white",                                // White background
    border: "border-gray-200",                        // Border color
  },

  // Layout
  layout: {
    container: "bg-gray-50 rounded-lg",               // Section container style
    card: "bg-white border border-gray-200 rounded-lg", // Card style
    grid: "grid grid-cols-1 md:grid-cols-3 gap-6",   // Standard grid layout
    flex: "flex items-center justify-between",        // Header layout
  },

  // Form Elements
  form: {
    input: "w-full bg-white border-gray-200 rounded-lg",
    select: "w-full bg-white border-gray-200 rounded-lg",
    label: "text-sm font-medium text-gray-700",
  },

  // Consistent Component Styles
  components: {
    sectionHeader: "flex items-center justify-between mb-6",
    sectionTitle: "text-2xl font-bold text-gray-800",
    sectionContainer: "bg-gray-50 rounded-lg p-6 mb-[18px]",
  }
};

// Helper function to apply consistent spacing
export const applySpacing = (type: keyof typeof designSystem.spacing) => {
  return designSystem.spacing[type];
};

// Helper function to apply consistent typography
export const applyTypography = (type: keyof typeof designSystem.typography) => {
  return designSystem.typography[type];
};
