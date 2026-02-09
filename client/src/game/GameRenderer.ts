import { Player } from "./Player";
import { Terrain } from "./Terrain";
import { GameWorld } from "./GameWorld";

export const renderWorld = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  world: GameWorld,
): void => {
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(-world.camera.bottomLeftWorldX, world.camera.toScreenY(-world.camera.bottomLeftWorldY));

  world.terrain.render(ctx);
  world.player.render(ctx);
  world.enemies.forEach(enemy => enemy.render(ctx));
  world.bullets.forEach(bullet => bullet.render(ctx));
  world.grenades.forEach(grenade => grenade.render(ctx));
  world.rockets.forEach(rocket => rocket.render(ctx));
  world.particleSystem.render(ctx);

  ctx.restore();
  renderUI(ctx, canvas, world);
};

const renderUI = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  world: GameWorld,
): void => {
  const healthBarWidth = 200;
  const healthBarHeight = 20;
  const healthPercentage = world.player.health / Player.MAX_HEALTH;
  const healthDisplay = Math.floor(world.player.health);

  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(20, 20, healthBarWidth + 4, healthBarHeight + 4);

  ctx.fillStyle = "red";
  ctx.fillRect(22, 22, healthBarWidth, healthBarHeight);

  ctx.fillStyle = "green";
  ctx.fillRect(22, 22, healthBarWidth * healthPercentage, healthBarHeight);

  ctx.fillStyle = "white";
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`Health: ${healthDisplay}/${Player.MAX_HEALTH}`, 22 + healthBarWidth / 2, 22 + healthBarHeight / 2 + 6);
  ctx.textAlign = "left";
  ctx.fillStyle = "black";
  ctx.fillText(`Level: ${world.currentLevelName}`, 22, 60);

  const category = world.player.getSelectedWeaponCategory();
  const heldObject = world.player.getHeldObject();
  ctx.fillText(`Weapon: ${heldObject.type.name}`, 22, 80);

  if (category === "grenade") {
    ctx.fillText(`Grenades: ${world.player.getGrenadeCount()}/${world.player.getMaxGrenades()}`, 22, 100);
  } else if (category === "launcher") {
    ctx.fillText(`Rockets: ${world.player.getRocketsLeft()}/${world.player.arsenal.heldLaunchingWeapon.type.capacity}`, 22, 100);
  } else {
    ctx.fillText(`Ammo: ${world.player.arsenal.heldShootingWeapon.getBulletsLeft()}/${world.player.arsenal.heldShootingWeapon.getCapacity()}`, 22, 100);
  }

  if (world.debugMode) {
    renderProgressBar(ctx, canvas, world);
    renderDebugInfo(ctx, canvas, world);
  }
};

const renderProgressBar = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  world: GameWorld,
): void => {
  const levelWidth = world.terrain.getLevelWidth();
  const progressPercentage = Math.min(world.player.transform.position.x / levelWidth, 1);
  const progressBarWidth = 200;
  const progressBarHeight = 10;

  const padding = 20;
  const progressBarY = canvas.height - padding - progressBarHeight;

  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(padding, progressBarY, progressBarWidth + 4, progressBarHeight + 4);

  ctx.fillStyle = "lightblue";
  ctx.fillRect(padding + 2, progressBarY + 2, progressBarWidth * progressPercentage, progressBarHeight);

  ctx.fillStyle = "white";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(progressPercentage * 100)}%`, padding + progressBarWidth / 2, progressBarY + progressBarHeight / 2 + 6);
  ctx.textAlign = "left";
};

const renderDebugInfo = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  world: GameWorld,
): void => {
  const player = world.player;
  const terrainHeight = world.terrain.getHeightAt(player.transform.position.x);
  const playerTop = player.transform.position.y - player.bounds.height / 2;
  const debugLines = [
    `Debug Info:`,
    `Terrain Height: ${terrainHeight?.toFixed(2)}`,
    `Player X: ${player.transform.position.x.toFixed(2)}`,
    `Player Y: ${player.transform.position.y.toFixed(2)}`,
    `Player Top: ${playerTop.toFixed(2)}`,
    `Velocity X: ${player.velocity.x.toFixed(2)}`,
    `Velocity Y: ${player.velocity.y.toFixed(2)}`,
  ];
  ctx.font = "14px monospace";
  ctx.fillStyle = "#222";

  const padding = 20;
  const lineHeight = 20;
  const startY = canvas.height - padding - debugLines.length * lineHeight;
  debugLines.forEach((line, i) => {
    ctx.fillText(line, 30, startY + i * lineHeight);
  });
};
