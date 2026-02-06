"""
Parking Bay Occupancy Simulation Service
Simulates realistic bay status changes for demonstration purposes
"""
import asyncio
import logging
import os
import random
from datetime import datetime, timedelta
from typing import Optional
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Simulation configuration
SIMULATION_ENABLED = os.getenv('SIMULATION_ENABLED', 'true').lower() == 'true'
SIMULATION_INTERVAL_SECONDS = int(os.getenv('SIMULATION_INTERVAL_SECONDS', '180'))  # 3 minutes
SIMULATION_BATCH_SIZE = int(os.getenv('SIMULATION_BATCH_SIZE', '50'))

# Status distribution weights (should sum to 100)
STATUS_WEIGHTS = {
    'occupied': 55,    # 55% of bays occupied
    'available': 35,   # 35% available
    'reserved': 5,     # 5% reserved
    'closed': 5        # 5% closed for maintenance
}

# Time-of-day modifiers (hour: occupancy multiplier)
# Higher values = more occupied during peak hours
TIME_MODIFIERS = {
    0: 0.3, 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.3,
    6: 0.5, 7: 0.7, 8: 0.9, 9: 1.0, 10: 1.0, 11: 1.0,
    12: 0.95, 13: 0.9, 14: 0.95, 15: 1.0, 16: 1.0, 17: 1.0,
    18: 0.9, 19: 0.8, 20: 0.6, 21: 0.5, 22: 0.4, 23: 0.35
}

# Thread pool for running sync DB operations
_executor = ThreadPoolExecutor(max_workers=2)


class OccupancySimulator:
    """
    Simulates parking bay occupancy changes
    Updates bay statuses periodically to create realistic occupancy patterns
    """
    
    def __init__(self, session_factory):
        self.session_factory = session_factory
        self._running = False
        self._task: Optional[asyncio.Task] = None
    
    async def start(self):
        """Start the simulation background task"""
        if not SIMULATION_ENABLED:
            logger.info("Occupancy simulation is disabled")
            return
        
        if self._running:
            logger.warning("Simulation already running")
            return
        
        self._running = True
        self._task = asyncio.create_task(self._run_simulation_loop())
        logger.info(f"Occupancy simulation started (interval: {SIMULATION_INTERVAL_SECONDS}s)")
    
    async def stop(self):
        """Stop the simulation background task"""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Occupancy simulation stopped")
    
    async def _run_simulation_loop(self):
        """Main simulation loop"""
        while self._running:
            try:
                # Run sync DB operation in thread pool
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(_executor, self._update_bay_statuses_sync)
                await asyncio.sleep(SIMULATION_INTERVAL_SECONDS)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Simulation error: {e}")
                await asyncio.sleep(30)  # Wait before retrying
    
    def _update_bay_statuses_sync(self):
        """Update a batch of bay statuses (synchronous)"""
        session = self.session_factory()
        try:
            # Get current hour for time-based modifiers
            current_hour = datetime.now().hour
            occupancy_modifier = TIME_MODIFIERS.get(current_hour, 0.7)
            
            # Adjust weights based on time of day
            adjusted_weights = self._adjust_weights(occupancy_modifier)
            
            # Select random bays to update
            result = session.execute(text('''
                SELECT bay_id, status 
                FROM parking_bays 
                WHERE source = 'osm' OR generated = TRUE
                ORDER BY RANDOM() 
                LIMIT :batch_size
            '''), {'batch_size': SIMULATION_BATCH_SIZE})
            
            bays = result.fetchall()
            
            if not bays:
                logger.debug("No OSM bays to simulate")
                return
            
            updates = 0
            for bay_id, current_status in bays:
                # Determine new status
                new_status = self._choose_status(adjusted_weights, current_status)
                
                if new_status != current_status:
                    session.execute(text('''
                        UPDATE parking_bays 
                        SET status = :status, last_status_update = NOW()
                        WHERE bay_id = :bay_id
                    '''), {'status': new_status, 'bay_id': bay_id})
                    updates += 1
            
            session.commit()
            
            if updates > 0:
                logger.debug(f"Updated {updates} bay statuses (hour={current_hour}, occupancy_mod={occupancy_modifier:.2f})")
                
        except Exception as e:
            session.rollback()
            logger.error(f"Error updating bay statuses: {e}")
            raise
        finally:
            session.close()
    
    def _adjust_weights(self, occupancy_modifier: float) -> dict:
        """Adjust status weights based on time of day"""
        # Scale occupied percentage by modifier
        base_occupied = STATUS_WEIGHTS['occupied']
        adjusted_occupied = min(85, int(base_occupied * occupancy_modifier))
        
        # Redistribute remaining percentage
        remaining = 100 - adjusted_occupied - STATUS_WEIGHTS['closed'] - STATUS_WEIGHTS['reserved']
        
        return {
            'occupied': adjusted_occupied,
            'available': max(5, remaining),
            'reserved': STATUS_WEIGHTS['reserved'],
            'closed': STATUS_WEIGHTS['closed']
        }
    
    def _choose_status(self, weights: dict, current_status: str) -> str:
        """
        Choose new status with some persistence (bays don't flip too frequently)
        """
        # 70% chance to keep current status (stability)
        if random.random() < 0.7:
            return current_status
        
        # 30% chance to change status
        statuses = list(weights.keys())
        total = sum(weights.values())
        
        r = random.randint(1, total)
        cumulative = 0
        
        for status in statuses:
            cumulative += weights[status]
            if r <= cumulative:
                return status
        
        return 'available'


# Global simulator instance
_simulator: Optional[OccupancySimulator] = None


async def get_simulator(session_factory) -> OccupancySimulator:
    """Get or create the global simulator instance"""
    global _simulator
    if _simulator is None:
        _simulator = OccupancySimulator(session_factory)
    return _simulator


async def start_simulation(session_factory):
    """Start the occupancy simulation"""
    simulator = await get_simulator(session_factory)
    await simulator.start()


async def stop_simulation():
    """Stop the occupancy simulation"""
    global _simulator
    if _simulator:
        await _simulator.stop()
        _simulator = None


# Manual trigger for testing
def trigger_simulation_update_sync(session_factory):
    """Manually trigger a simulation update (synchronous)"""
    simulator = OccupancySimulator(session_factory)
    simulator._update_bay_statuses_sync()
