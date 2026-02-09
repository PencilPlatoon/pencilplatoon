import { DamageableEntity, GameObject, ExplodingEntity } from "./types";
import { Vector2 } from "./Vector2";
import { AbsoluteBoundingBox } from "./BoundingBox";
import { Player } from "./Player";
import { Enemy } from "./Enemy";
import { Bullet } from "./Bullet";
import { Grenade } from "./Grenade";
import { Rocket } from "./Rocket";
import { Terrain } from "./Terrain";
import { ParticleSystem } from "./ParticleSystem";
import { SoundManager } from "./SoundManager";

export const checkAABBOverlap = (a: AbsoluteBoundingBox, b: AbsoluteBoundingBox): boolean =>
  a.upperLeft.x < b.lowerRight.x &&
  a.lowerRight.x > b.upperLeft.x &&
  a.lowerRight.y < b.upperLeft.y &&
  a.upperLeft.y > b.lowerRight.y;

export const applyExplosionDamage = (
  entity: DamageableEntity,
  explosionPos: Vector2,
  explosionRadius: number,
  explosionDamage: number
): void => {
  const center = entity.getCenterOfGravity();
  const distance = Math.hypot(center.x - explosionPos.x, center.y - explosionPos.y);

  if (distance <= explosionRadius) {
    const damageMultiplier = 1 - (distance / explosionRadius);
    const finalDamage = explosionDamage * damageMultiplier;
    entity.takeDamage(finalDamage);
    console.log(`[GRENADE] ${entity.getEntityLabel()} hit for ${finalDamage.toFixed(1)} damage at distance ${distance.toFixed(1)}`);
  }
};

export class CollisionSystem {
  checkCollision(a: AbsoluteBoundingBox, b: AbsoluteBoundingBox): boolean {
    return checkAABBOverlap(a, b);
  }

  checkPointInRect(point: Vector2, rect: AbsoluteBoundingBox): boolean {
    return point.x >= rect.upperLeft.x &&
           point.x <= rect.lowerRight.x &&
           point.y <= rect.upperLeft.y &&
           point.y >= rect.lowerRight.y;
  }

  checkLineIntersectsRect(start: Vector2, end: Vector2, rect: AbsoluteBoundingBox): boolean {
    // Liang-Barsky algorithm for line-rect intersection
    let t0 = 0, t1 = 1;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const left = rect.upperLeft.x;
    const right = rect.lowerRight.x;
    const top = rect.upperLeft.y;
    const bottom = rect.lowerRight.y;
    const p = [-dx, dx, -dy, dy];
    const q = [start.x - left, right - start.x, top - start.y, start.y - bottom];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return false;
      } else {
        const r = q[i] / p[i];
        if (p[i] < 0) {
          if (r > t1) return false;
          if (r > t0) t0 = r;
        } else {
          if (r < t0) return false;
          if (r < t1) t1 = r;
        }
      }
    }
    return true;
  }

  checkGameObjectCollision(objectA: GameObject, objectB: GameObject): boolean {
    const boundsA = objectA.getAbsoluteBounds();
    const boundsB = objectB.getAbsoluteBounds();
    
    return (
      this.checkCollision(boundsA, boundsB) ||
      this.checkLineIntersectsRect(
        objectA.previousPosition,
        objectA.transform.position,
        boundsB
      )
    );
  }

  handleCollisions({
    bullets,
    enemies,
    grenades,
    rockets,
    player,
    terrain,
    particleSystem,
    soundManager
  }: {
    bullets: Bullet[];
    enemies: Enemy[];
    grenades: Grenade[];
    rockets: Rocket[];
    player: Player;
    terrain: Terrain;
    particleSystem: ParticleSystem;
    soundManager: SoundManager;
  }): void {
    const damageableEntities: DamageableEntity[] = [...enemies, player];

    bullets.forEach(bullet => {
      if (!bullet.active) return;
      damageableEntities.forEach(entity => {
        this.handleBulletDamageableEntityCollision(bullet, entity, particleSystem, soundManager);
      });
    });

    bullets.forEach(bullet => {
      if (!bullet.active) return;
      this.handleBulletTerrainCollision(bullet, terrain, particleSystem);
    });

    rockets.forEach(rocket => {
      if (!rocket.active) return;
      if (rocket.hasLastHolder()) {
        return;
      }
      damageableEntities.forEach(entity => {
        this.handleRocketDamageableEntityCollision(rocket, entity);
      });
    });

    rockets.forEach(rocket => {
      if (!rocket.active) return;
      this.handleRocketTerrainCollision(rocket, terrain);
    });

    grenades.forEach(grenade => {
      if (!grenade.active && grenade.isExploded()) {
        this.handleExplosion(grenade, damageableEntities, particleSystem, soundManager);
      }
    });

    rockets.forEach(rocket => {
      if (!rocket.active && rocket.isExploded()) {
        this.handleExplosion(rocket, damageableEntities, particleSystem, soundManager);
      }
    });
  }

  private handleBulletDamageableEntityCollision(
    bullet: Bullet,
    entity: DamageableEntity,
    particleSystem: ParticleSystem,
    soundManager: SoundManager
  ): void {
    if (this.checkGameObjectCollision(bullet, entity)) {
      entity.takeDamage(bullet.damage);
      bullet.deactivate(`hit-${entity.getEntityLabel()}`);
      particleSystem.createExplosion(bullet.getExplosionParameters(entity));
      soundManager.playHit();
    }
  }

  private handleBulletTerrainCollision(
    bullet: Bullet,
    terrain: Terrain,
    particleSystem: ParticleSystem
  ): void {
    const bulletAbs = bullet.getAbsoluteBounds();
    if (terrain.checkCollision(bulletAbs)) {
      bullet.deactivate('hit-terrain', terrain);
      particleSystem.createExplosion(bullet.getTerrainExplosionParameters());
    }
  }

  private handleRocketDamageableEntityCollision(rocket: Rocket, entity: DamageableEntity): void {
    if (this.checkGameObjectCollision(rocket, entity)) {
      rocket.explode();
    }
  }

  private handleRocketTerrainCollision(rocket: Rocket, terrain: Terrain): void {
    const rocketAbs = rocket.getAbsoluteBounds();
    if (terrain.checkCollision(rocketAbs)) {
      rocket.explode();
    }
  }

  private handleExplosion(
    explosive: ExplodingEntity,
    entities: DamageableEntity[],
    particleSystem: ParticleSystem,
    soundManager: SoundManager
  ): void {
    const explosionPos = explosive.transform.position;
    const explosionRadius = explosive.explosionRadius;
    const explosionDamage = explosive.explosionDamage;
    const explosionParams = explosive.getExplosionParameters();
    
    console.log(`[${explosive.getEntityLabel().toUpperCase()}] Explosion at (${explosionPos.x.toFixed(1)}, ${explosionPos.y.toFixed(1)}) with radius ${explosionRadius}`);
    
    // Create explosion particle effect with radius-scaled animation
    particleSystem.createExplosion(explosionParams);
    soundManager.playHit(); // Use hit sound for explosion
    
    // Damage entities within explosion radius
    entities.forEach(entity => {
      applyExplosionDamage(entity, explosionPos, explosionRadius, explosionDamage);
    });
  }
}
