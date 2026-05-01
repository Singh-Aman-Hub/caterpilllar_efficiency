# Autonomous Truck Dumping Simulation Strategy

This document provides a detailed overview of the autonomous truck dumping strategy, pattern generation, coordinate selection, and material-specific behaviors implemented in the simulation engine.

## 1. Dumping Pattern (Columnar Strategy)
The core simulation employs a **Columnar Packing Strategy**. Instead of random or purely radial dumping, the yard is logically divided into parallel vertical strips (columns). 
- Trucks approach the assigned column and create a linear sequence of dumps.
- **Crescent Shift:** A mathematical curve (`0.0035 * dy^2`) is applied to the columns, giving them a slight crescent bow. This crescent shape optimizes the structural integrity of the ridges.
- **Staggered Rows:** Adjacent columns are vertically staggered by half a step (`yStep / 2`). This creates an interlocking honeycomb-like grid, maximizing volumetric density and preventing deep ravines between ridges.

## 2. Dynamic Coordinate Selection & Prioritization
To mimic real-world mine operations and prevent autonomous fleet deadlocks, the simulation intelligently prioritizes where to start dumping.
- **Dynamic Boundary:** The yard map is not strictly rectangular; it supports custom user-defined polygonal boundaries. The simulation evaluates potential dump coordinates and strictly discards any points outside the active `polygon` boundary.
- **Furthest-Point-First Sweeping:** When the yard is initialized or the entry point is changed, the engine calculates the absolute distance from the `entryPoint` to all four extreme edges of the yard. 
- The simulation will dynamically **start the dumping sequence at the furthest possible corner**. For example, if the entry is at the bottom-left, the trucks will first dump at the top-right corner.
- **Retreating Pattern:** Trucks fill the furthest column completely, working their way towards the entry. As the yard fills up, the required travel distance naturally decreases, preventing newly dumped piles from obstructing the paths of incoming trucks.

## 3. Material Properties & Spread Radius
Dumps are physically modeled as 2D Gaussian distributions, where the `loadVolume` dictates the total mass. The simulation calculates the cube root of the volume to derive proportional radii and heights.
Different materials behave differently when dropped, controlled by specific coefficients:
- **Coal:** Base spread (`k=1.8`), wide ellipse (`matFactor=1.2`), normal peak (`peakFactor=1.0`).
- **Iron Ore:** Dense spread (`k=1.4`), tight ellipse (`matFactor=0.9`), high peak (`peakFactor=1.3`).
- **Limestone:** Moderate spread (`k=1.6`), circular (`matFactor=1.0`), moderate peak (`peakFactor=1.1`).
- **Overburden:** Loose spread (`k=2.0`), wide ellipse (`matFactor=1.3`), low peak (`peakFactor=0.9`).
- **Jittering:** To make the simulation realistic, a random jittering algorithm slightly mutates every dump's `rx` (x-radius), `ry` (y-radius), and `peak` (height) by up to 20%, ensuring organic pile generation rather than identical sterile cones.

## 4. Packing Optimization & Overlap Management
The simulation includes configurable features to push packing efficiency to its maximum safe limit.
- **Dynamic Gap Distance:** Users can dynamically adjust the `gapDistance` factor. A factor of `1.0` is standard, while a factor `< 1.0` forces columns and rows to overlap more aggressively. 
- **Continuous Ridges:** As Gaussian piles overlap, their heights naturally sum together up to an absolute `MAX_H` (10.0m) limit. This fuses individual dumps into continuous geographic ridges.
- **Occupancy Mapping:** An internal high-resolution occupancy grid validates that no two dumps are perfectly stacked on top of each other, ensuring the `gapDistance` is respected and the volume is distributed efficiently.
- **Slope & Slip Constraints:** The engine continuously monitors the gradient across the yard (`slopeAt`). Slopes are kept strictly below the critical slip threshold (`0.85`). Overlapping too aggressively will spike the gradient and limit utilization, forcing the algorithm to find more optimal saddle points between existing piles.

## 5. Row Partitioning Strategy
To optimize efficiency and minimize wait times between multiple trucks dumping simultaneously, the yard employs an intelligent **Row Partitioning System**:
- **Column Division:** Rather than having all trucks dump sequentially next to each other within the same column (which would cause traffic congestion), the active column is divided into discrete **partitions** (rows).
- **Truck Allocation:** Each truck is dynamically assigned its own partition within the active column. For example, if there are 3 trucks, the column is split into 3 segments. Truck 1 works the top segment, Truck 2 the middle, and Truck 3 the bottom.
- **Dynamic Capacity:** The simulation automatically calculates the optimal number of partitions (`P`) based on the number of trucks available, the total length of the active column, and the area per dump (which is directly affected by the material's spread radius and the user-defined `gapDistance`).
- **User Override:** Users have the manual option via the UI to override the automatic partition calculation and explicitly set the number of desired partitions (e.g., 1, 2, 3, 4, 5). 
- **Reallocation Logic:** If a truck finishes its assigned partition (i.e., its partition is fully occupied), the system gracefully reallocates the truck. It will first look for any remaining available slots within the active column (assisting slower trucks). Once the entire active column is filled, the trucks naturally progress to their respective partitions in the *next* active column.
