# Sample Design System

## Components Library

### Atoms

#### Button
**Description:** Primary interactive element for user actions
**Variants:** Primary, Secondary, Ghost, Danger
**Properties:**
- Size: Small, Medium, Large
- State: Default, Hover, Active, Disabled, Loading
- Icon: Optional left or right icon
- Full width option

**Usage:** Call-to-action, form submissions, navigation

---

#### Input
**Description:** Text input field for user data entry
**Variants:** Default, Search, Number, Email, Password
**Properties:**
- Size: Small, Medium, Large
- State: Default, Focus, Disabled, Error, Success
- Placeholder text
- Helper text
- Icon support
- Validation state

**Usage:** Forms, filters, search boxes

---

#### Card
**Description:** Container for related content
**Variants:** Default, Elevated, Outlined
**Properties:**
- Interactive option (clickable)
- Hover effects
- Icon header option
- Action buttons

**Usage:** Content grouping, metric display

---

#### Badge
**Description:** Small label for categorization
**Variants:** Success, Warning, Error, Info
**Properties:**
- Size: Small, Medium
- Dismissible option

**Usage:** Status indicators, tags

---

#### Select / Dropdown
**Description:** Choice selector component
**Variants:** Single select, Multiple select
**Properties:**
- Searchable option
- Clear button
- Disabled option
- Custom option rendering

**Usage:** Form inputs, filters

---

### Molecules

#### Form Field
**Description:** Composed input with label, helper, validation
**Components:** Label + Input + Helper/Error message
**Properties:**
- Required indicator
- Error state
- Success state
- Hint text

**Usage:** Form layouts

---

#### Metric Card
**Description:** Display single metric with value and change
**Components:** Card + Title + Large number + % change + Icon
**Properties:**
- Positive/negative indication (color)
- Icon
- Trend arrow (up/down)
- Sparkline option

**Usage:** Dashboard overview

---

#### Data Table
**Description:** Display tabular data with sorting/filtering
**Components:** Headers + Rows + Pagination + Actions
**Properties:**
- Sortable columns
- Selectable rows
- Hover states
- Dense/comfortable spacing
- Responsive (horizontal scroll on mobile)

**Usage:** Data display, listings

---

#### Chart Container
**Description:** Wrapper for data visualizations
**Components:** Title + Chart area + Legend + Controls
**Properties:**
- Title and subtitle
- Legend placement
- Download button
- Responsive sizing

**Usage:** Analytics, metrics visualization

---

#### Modal / Dialog
**Description:** Overlay content requiring user action
**Components:** Header + Content + Footer (actions)
**Properties:**
- Size: Small, Medium, Large
- Close button
- Backdrop dismiss option
- Accessibility (focus management, escape key)

**Usage:** Confirmations, forms, details

---

### Organisms

#### Navigation Header
**Description:** Top navigation with logo, menu, user profile
**Components:** Logo + Menu + Search + User menu
**Properties:**
- Sticky option
- Mobile hamburger menu
- Active state for current page
- Responsive collapse

**Usage:** App-level navigation

---

#### Sidebar Navigation
**Description:** Side menu for main navigation sections
**Components:** Logo + Menu items + Collapsible groups
**Properties:**
- Expandable/collapsible
- Active indicators
- Icon + label
- Nested items

**Usage:** Secondary navigation, dashboard menu

---

#### Dashboard Layout
**Description:** Grid layout for dashboard components
**Components:** Header + Sidebar + Main content area
**Properties:**
- Responsive grid
- Configurable column widths
- Sidebar toggle

**Usage:** Dashboard pages

---

## Design Tokens

### Colors
- **Primary:** #007AFF (Blue)
- **Success:** #34C759 (Green)
- **Warning:** #FF9500 (Orange)
- **Error:** #FF3B30 (Red)
- **Neutral 50:** #F9FAFB
- **Neutral 900:** #111827

### Typography
- **Display:** 48px, Bold, Line-height 1.2
- **Heading 1:** 36px, Bold
- **Heading 2:** 28px, Semibold
- **Body:** 16px, Regular
- **Small:** 14px, Regular
- **Caption:** 12px, Regular

### Spacing
- **XS:** 4px
- **SM:** 8px
- **MD:** 16px
- **LG:** 24px
- **XL:** 32px
- **XXL:** 48px

### Border Radius
- **None:** 0px
- **SM:** 4px
- **MD:** 8px
- **LG:** 12px
- **XL:** 16px
- **Full:** 9999px

### Shadows
- **SM:** 0 1px 2px rgba(0,0,0,0.05)
- **MD:** 0 4px 6px rgba(0,0,0,0.1)
- **LG:** 0 10px 15px rgba(0,0,0,0.1)
- **XL:** 0 20px 25px rgba(0,0,0,0.1)

---

## Component Matrix

| Component | Used in | Variants | States | Status |
|-----------|---------|----------|--------|--------|
| Button | All screens | 4 | 5 | Ready |
| Input | Forms, Filters | 5 | 5 | Ready |
| Card | Dashboard, Details | 3 | 2 | Ready |
| Table | Details, Reports | 1 | 2 | Ready |
| Select | Filters, Forms | 2 | 3 | Ready |
| Modal | Confirmations | 1 | 2 | Ready |
| Chart | Dashboard | - | - | **Missing** |
| DatePicker | Filters, Forms | 2 | 3 | **Missing** |
| FileUpload | Forms | 1 | 4 | **Missing** |

---

## Coverage Summary

- **Total Components:** 15
- **Atoms:** 6
- **Molecules:** 6
- **Organisms:** 3
- **Ready:** 12
- **Missing:** 3
- **Coverage:** 80%
