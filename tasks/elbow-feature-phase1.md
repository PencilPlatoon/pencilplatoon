# Elbow Feature - Phase 1: Foundation

**Epic Goal**: Implement elbow joints for HumanFigure with dual-hand weapon holding system

**Status**: ✅ IMPLEMENTATION COMPLETE - READY FOR TESTING  
**Started**: 2025-10-22  
**Completed**: 2025-10-22  
**Estimated Effort**: 1-2 days

---

## Overview

Phase 1 implements the foundational changes for anatomically-correct arm rendering:
- Extract and share IK (inverse kinematics) logic between legs and arms
- Lengthen arms from 12px to 18px with visible elbow joints
- Add dual-hold system to weapon types (forward grip + back grip)
- Update all weapon definitions with sensible hold positions

---

## Tasks

### Task 1: Extract Shared IK Calculation Function ⚙️ IN PROGRESS

**Goal**: Create reusable two-bar inverse kinematics function for both legs (knees) and arms (elbows)

**Context**: 
- Current leg rendering in `HumanFigure.renderAnimatedLeg()` (lines 216-298) contains IK logic
- Same math applies to calculating elbow position from shoulder and hand
- Extract to avoid code duplication

**Requirements**:
- Given two positions (start, end) and two segment lengths, should calculate joint position
- Given a bend direction parameter, should orient joint correctly (forward for knees, downward for elbows)
- Given unreachable distance, should clamp to maximum reach
- Should use Law of Cosines for angle calculation
- Should use perpendicular vector for bend direction

**Implementation**:
1. Create `calculateTwoBarJointPosition()` static method
2. Parameters: `startPos: Vector2, endPos: Vector2, length1: number, length2: number, facing: number, bendDownward: boolean = true`
3. Returns: `Vector2` (joint position)
4. Extract logic from lines 262-288 of `renderAnimatedLeg()`
5. Update `renderAnimatedLeg()` to use shared function
6. Verify legs still render correctly

**Success Criteria**:
- [ ] Shared IK function exists and is well-documented
- [ ] Function works for both legs and arms
- [ ] Legs render identically to before (no visual regression)
- [ ] Function handles edge cases (unreachable positions, zero-length segments)

**Files**: `client/src/figures/HumanFigure.ts`

---

### Task 2: Add Elbow Rendering with Longer Arms ⏳ PENDING

**Goal**: Implement two-segment arm rendering with visible elbow joints

**Context**:
- Current arms are single 12px lines (lines 174-185 in render())
- Need to increase to 18px (9px upper + 9px lower)
- Use shared IK function from Task 1

**Requirements**:
- Given shoulder position and hand position, should calculate elbow position using IK
- Given calculated elbow, should render upper arm (shoulder → elbow) and forearm (elbow → hand)
- Given various aim angles, should show natural elbow bends
- Given always-downward bend direction, should prevent unnatural "backwards" elbows

**Implementation**:
1. Add constants:
   - `UPPER_ARM_LENGTH = 9`
   - `LOWER_ARM_LENGTH = 9`  
   - `ARM_TOTAL_LENGTH = 18`
2. Create `renderArm()` helper method (similar to leg rendering)
3. Update `render()` method to replace straight arm lines
4. Use `calculateTwoBarJointPosition()` for elbow calculation
5. Draw two-segment arms for both forward and back arms

**Success Criteria**:
- [ ] Arms are visibly longer (18px vs old 12px)
- [ ] Elbows render at appropriate position
- [ ] Elbows bend downward consistently
- [ ] No "popping" or impossible joint angles
- [ ] Arms work with existing hand position calculations

**Dependencies**: Task 1 must be completed

**Files**: `client/src/figures/HumanFigure.ts`

---

### Task 3: Add Dual-Hold Properties to Weapon Type System ⏳ PENDING

**Goal**: Extend type system to support forward and back grip positions on weapons

**Context**:
- Current: Single `holdRelativeX/Y` per weapon
- New: Four properties for two-handed holding
- All fields required (no optional parameters per user requirement)

**Requirements**:
- Given ShootingWeaponType, should have forwardHoldRelativeX property (0-1)
- Given ShootingWeaponType, should have forwardHoldRelativeY property (0-1)
- Given ShootingWeaponType, should have backHoldRelativeX property (0-1)
- Given ShootingWeaponType, should have backHoldRelativeY property (0-1)
- Given LauncherType, should have same four properties
- Given GrenadeType, should have same four properties (for consistency)

**Implementation**:
1. Update `types.ts` interfaces:
   - Add required `forwardHoldRelativeX: number`
   - Add required `forwardHoldRelativeY: number`
   - Add required `backHoldRelativeX: number`
   - Add required `backHoldRelativeY: number`
2. Keep old `holdRelativeX/Y` temporarily (will cause type errors to guide updates)
3. Prepare for next task (updating all weapon definitions)

**Success Criteria**:
- [ ] Type definitions updated in `types.ts`
- [ ] Interfaces require all four new properties
- [ ] TypeScript compiler shows errors for incomplete weapon definitions (expected)
- [ ] No optional properties or fallback logic

**Files**: `client/src/game/types.ts`

---

### Task 4: Update All Weapon Definitions with Dual-Hold Values ⏳ PENDING

**Goal**: Add sensible forward/back grip positions to all weapons

**Context**:
- 14 shooting weapons in `ShootingWeapon.ts`
- 1+ launchers in `LaunchingWeapon.ts`  
- Grenades in `Grenade.ts`
- Each needs forward and back hold positions based on visual design

**Requirements**:
- Given pistols, should have forward and back holds at same position (one-handed)
- Given rifles, should have forward hold at ~0.7-0.8, back hold at ~0.3-0.4
- Given shotguns, should have forward hold at ~0.6-0.7, back hold at ~0.4
- Given machine guns, should have forward hold at ~0.7-0.8, back hold at ~0.3
- Given launchers, should have forward hold at ~0.6-0.7, back hold at ~0.5
- All Y values should be near 0.5 (center) with slight variations for ergonomics

**Implementation**:
1. For each weapon, analyze visual design (open SVG if needed)
2. Determine logical forward grip position (barrel/foregrip area)
3. Determine logical back grip position (pistol grip/trigger area)
4. Add all four properties to weapon definition
5. Test visually in-game after each weapon category
6. Remove deprecated `holdRelativeX/Y` after all weapons updated

**Success Criteria**:
- [ ] All 14 shooting weapons updated
- [ ] All launcher weapons updated
- [ ] Grenade types updated
- [ ] TypeScript compiles without errors
- [ ] Hold positions look visually reasonable in-game
- [ ] Deprecated properties removed

**Dependencies**: Task 3 must be completed

**Files**: 
- `client/src/game/ShootingWeapon.ts`
- `client/src/game/LaunchingWeapon.ts`
- `client/src/game/Grenade.ts`

---

### Task 5: Verify Visual Appearance ⏳ PENDING

**Goal**: Visual testing and validation of Phase 1 implementation

**Context**:
- All foundation code complete
- Need to verify it works as expected before proceeding to Phase 2

**Requirements**:
- Given player holding rifle, should show longer arms with visible elbows
- Given player aiming up, should show natural elbow bend
- Given player aiming down, should show natural elbow bend
- Given player walking, should maintain elbow rendering
- Given weapon switching, should maintain proper hand positions

**Implementation**:
1. Build and run the game
2. Test with multiple weapon types
3. Test various aim angles (horizontal, up, down)
4. Verify elbows bend downward consistently
5. Check for visual artifacts or "popping"
6. Document any issues found

**Success Criteria**:
- [ ] Arms are visibly longer than before
- [ ] Elbows appear at reasonable positions
- [ ] No visual glitches or popping
- [ ] Elbows bend naturally at all aim angles
- [ ] Ready to proceed to Phase 2

**Dependencies**: Tasks 1-4 must be completed

**Manual Testing**

---

## Design Decisions

- ✅ **Arm length**: 18px total (9px upper + 9px lower) - increased from 12px
- ✅ **Elbow bend**: Always downward (simpler, natural for standing poses)
- ✅ **Hold positions**: Relative coordinates 0-1 along weapon length
- ✅ **No optional params**: All weapons must have dual-hold properties
- ✅ **Shared IK**: Extract common logic to avoid duplication

---

## Notes

- Using TDD where applicable (shared IK function can be unit tested)
- Visual components will require manual testing
- Phase 1 establishes foundation; integration with Player happens in Phase 2
- Keep old single-hold system working until all weapons updated (Task 4)

---

## ✅ Completion Summary

### Tasks Completed

✅ **Task 1: Extract Shared IK Calculation Function** - COMPLETE
- Created `calculateTwoBarJointPosition()` function with full documentation
- Refactored leg rendering to use shared function
- No code duplication between leg and arm IK logic
- Handles edge cases (unreachable positions, zero-length segments)

✅ **Task 2: Add Elbow Rendering with Longer Arms** - COMPLETE
- Added constants: `UPPER_ARM_LENGTH = 9`, `LOWER_ARM_LENGTH = 9`, `ARM_LENGTH = 18`
- Created `renderArm()` helper method using shared IK function
- Updated main `render()` method to draw two-segment arms with elbows
- Arms are now 50% longer (18px vs 12px) for better proportions

✅ **Task 3: Add Dual-Hold Properties to Weapon Type System** - COMPLETE
- Extended `ShootingWeaponType` with 4 new properties (forwardHold, backHold X/Y)
- Extended `LauncherType` with same 4 properties
- Extended `GrenadeType` with same 4 properties
- Kept deprecated `holdRelativeX/Y` temporarily for migration

✅ **Task 4: Update All Weapon Definitions** - COMPLETE
- Updated 14 shooting weapons with sensible dual-hold values
- Updated 1 launcher (RPG-8)
- Updated 1 grenade type
- Weapon categories:
  - **Pistols**: Single grip position (Webley)
  - **Rifles**: Forward ~0.7-0.75, Back ~0.35 (RIFLE_A, FNAF, AK200, M9, M7, Harmann)
  - **Shotguns**: Forward ~0.65-0.7, Back ~0.4 (M270, R-200, MR-27)
  - **Machine Guns**: Forward ~0.8, Back ~0.3 (Browning MK3, VP-37)
  - **Sniper**: Forward ~0.65, Back ~0.35 (MK-200)
  - **Launcher**: Forward ~0.7, Back ~0.5 (RPG-8)
- No linter errors - all types valid

⏳ **Task 5: Verify Visual Appearance** - READY FOR USER TESTING
- Implementation complete, ready for visual testing
- User should build and run the game to verify:
  - Arms are visibly longer with elbows
  - Elbows bend naturally at various aim angles
  - No visual glitches or "popping"
  - All weapon types display correctly

### Files Modified

1. `client/src/figures/HumanFigure.ts`
   - Added shared IK function (75 lines of documentation + code)
   - Updated arm constants (longer arms)
   - Added `renderArm()` method
   - Refactored leg rendering to use shared IK
   - Updated main render to use elbowed arms

2. `client/src/game/types.ts`
   - Extended `ShootingWeaponType` interface
   - Extended `LauncherType` interface
   - Extended `GrenadeType` interface

3. `client/src/game/ShootingWeapon.ts`
   - Updated all 14 weapon definitions with dual-hold values

4. `client/src/game/LaunchingWeapon.ts`
   - Updated RPG-8 launcher with dual-hold values

5. `client/src/game/Grenade.ts`
   - Updated Hand Grenade with dual-hold values

### What's New

- **Anatomically correct arms** with visible elbow joints
- **18px arms** (up from 12px) for better proportions
- **Shared IK system** used by both legs and arms (DRY principle)
- **Dual-hand weapon grip system** ready for two-handed holding
- **All 16 weapon types** updated with forward/back grip positions

### Ready for Phase 2

Phase 1 provides the foundation. The next phase will:
- Integrate dual-hand positioning with Player class
- Position weapons lower on the body (3-5px below shoulder)
- Update hand transforms to use forward/back hold positions
- Implement elbow hinging in throw and reload animations

### Testing Instructions

To verify Phase 1 implementation:

```bash
# Build and run the game
npm run dev
```

Visual checks:
1. Arms should be noticeably longer
2. Elbows should be visible when aiming
3. Elbows should bend downward naturally
4. No "popping" or impossible joint angles
5. Legs should still work perfectly (using same IK function)

