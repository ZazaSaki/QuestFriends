---
name: Sacred Path Design System
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f4'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#424844'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f0f1f1'
  outline: '#737874'
  outline-variant: '#c2c8c2'
  surface-tint: '#4f6358'
  primary: '#13251c'
  on-primary: '#ffffff'
  primary-container: '#283b31'
  on-primary-container: '#90a598'
  inverse-primary: '#b6ccbe'
  secondary: '#994703'
  on-secondary: '#ffffff'
  secondary-container: '#fc934f'
  on-secondary-container: '#6d3000'
  tertiary: '#22221e'
  on-tertiary: '#ffffff'
  tertiary-container: '#383733'
  on-tertiary-container: '#a2a09b'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d2e8d9'
  primary-fixed-dim: '#b6ccbe'
  on-primary-fixed: '#0c1f16'
  on-primary-fixed-variant: '#384b40'
  secondary-fixed: '#ffdbc9'
  secondary-fixed-dim: '#ffb68c'
  on-secondary-fixed: '#321200'
  on-secondary-fixed-variant: '#753400'
  tertiary-fixed: '#e6e2dc'
  tertiary-fixed-dim: '#c9c6c0'
  on-tertiary-fixed: '#1c1c18'
  on-tertiary-fixed-variant: '#484743'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  headline-xl:
    fontFamily: Playfair Display
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-md:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.1em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  unit: 8px
  container-margin: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  section-padding: 48px
---

## Brand & Style

The design system is crafted for a location-based quest game with a spiritual and community-driven soul. It balances the timeless authority of a sacred journey with the modern, tactile interface of a contemporary mobile game.

The visual style is **Soft Minimalist with Organic Accents**. It prioritizes clarity and serenity, using large negative spaces and a warm, paper-like background to evoke a sense of calm and focus. Interaction elements feel physical and approachable through the use of deep rounded corners and soft, diffused shadows, suggesting a "tangible" quest log or artifact. The aesthetic is professional yet inviting, designed to make users feel like they are embarking on a meaningful exploration rather than just playing a digital game.

## Colors

The palette is grounded in earth tones to reflect the location-based, outdoor nature of the quest.

- **Background (#fcf8f2):** A warm cream that serves as the primary canvas, reducing eye strain and providing a "parchment" feel.
- **Primary Dark Green (#283b31):** Used for high-hierarchy text, primary buttons, and iconography. It conveys growth, stability, and tradition.
- **Accent Orange (#d97736):** Reserved for call-to-action elements, quest markers, and active states. It provides high contrast against the green and cream for immediate visual recognition.
- **Neutral White (#ffffff):** Used exclusively for card containers and elevated surfaces to create a clean separation from the background.
- **Supportive Tones:** Soft greens and oranges are used at lower opacities (10-20%) for hover states or background washes within components.

## Typography

This design system utilizes a high-contrast typographic pairing to distinguish between narrative content and functional UI.

- **Headlines:** Use **Playfair Display**. The serif elegance brings a literary and "quest-like" quality to the experience. Use for titles, major headers, and section names.
- **Body & Labels:** Use **Inter**. This provides maximum legibility for quest descriptions, instructions, and data-heavy blocks.
- **Styling Note:** Labels and small identifiers should often use `uppercase` with the defined letter spacing to create a clean, organized hierarchy that feels "designed" rather than just "written."

## Layout & Spacing

The layout is built on a **Fluid Grid** model optimized for mobile devices, using a 4-column system for small screens and an 8-column system for tablets.

- **Margins:** A generous 24px side margin ensures content does not feel cramped and accommodates various device bezels.
- **Information Blocks:** Content is grouped into high-contrast white cards. These cards should span the full width of the available column space minus the margins.
- **The "Pill" Concept:** Floating elements, such as navigation or filter bars, should maintain a consistent 16px distance from the screen edges and bottom safe area.
- **Vertical Rhythm:** Use the `stack` variables to maintain consistent gaps between text blocks and interactive elements. `stack-lg` is preferred between distinct content sections to maintain the minimalist breathability of the design.

## Elevation & Depth

Hierarchy is established through **Ambient Shadows** and **Tonal Layering**.

- **Level 0 (Background):** The Cream (#fcf8f2) base.
- **Level 1 (Cards/Containers):** Pure White (#ffffff) surfaces with `shadow-md` (0px 4px 12px rgba(40, 59, 49, 0.05)). This subtle tint in the shadow prevents it from looking "dirty" against the cream.
- **Level 2 (Interactive/Floating):** Floating buttons and navigation pills. These use `shadow-lg` (0px 8px 24px rgba(40, 59, 49, 0.12)) to appear physically closer to the user.
- **Depth Transitions:** When a card is pressed, it should visually "sink" by reducing the shadow spread and slightly scaling down (0.98x), reinforcing the tactile nature of the UI.

## Shapes

The shape language is defined by extreme **Roundedness** to reinforce the friendly, community-centric nature of the game.

- **Cards & Primary Blocks:** Use `rounded-3xl` (1.5rem / 24px) to create a soft, non-threatening frame for content.
- **Interactive Elements:** Buttons and input fields should follow the same `rounded-3xl` radius.
- **Floating Navigation:** The bottom navigation bar must be a perfect pill shape (height / 2), emphasizing its role as an overlay rather than a fixed part of the screen architecture.
- **Iconography:** Icons should feature rounded caps and corners (2px stroke with round joins) to harmonize with the container shapes.

## Components

### Buttons
- **Primary:** Background #d97736, Text #ffffff, `rounded-3xl`. Use for the main quest action.
- **Secondary:** Background #283b31, Text #ffffff, `rounded-3xl`. Use for internal navigation or administrative actions.
- **Outline:** Transparent background, 1.5px border of #283b31, Text #283b31. Use for secondary choices.

### Floating Navigation
- A horizontal pill-shaped bar positioned at the bottom of the screen. 
- Background: #283b31 with 90% opacity (or Backdrop Blur).
- Icons and active state indicators: #ffffff for inactive, #d97736 for active.

### Cards
- Background: #ffffff.
- Shadow: `shadow-md` with the primary green tint.
- Padding: 20px - 24px internally.
- Use for quest details, leaderboard entries, and user profiles.

### Input Fields
- Background: #fcf8f2 (matching the main background to create a "cut-out" look) or a very light tint of the primary green.
- Border: 1px #283b31 at 20% opacity, changing to #d97736 on focus.
- Labels: `label-md` in uppercase above the field.

### Chips/Markers
- Small pills used for quest difficulty or categories.
- Background: #283b31 at 10% opacity, Text: #283b31.
- Active state: Background #d97736, Text #ffffff.