'use client';

/**
 * CryptoAgentHQ - Agent Orbs
 * 3D visualization of agent team as floating holographic orbs
 */

import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, Html, Sphere, MeshDistortMaterial, Ring } from '@react-three/drei';
import * as THREE from 'three';
import type { AgentRole } from '@/types/agent';
import { useAgentStore } from '@/lib/store/agent-store';

// Agent configuration with positions and colors
const AGENT_CONFIG: Record<
    AgentRole,
    { label: string; emoji: string; color: string; position: [number, number, number] }
> = {
    orchestrator: {
        label: 'Orchestrator',
        emoji: '🎛️',
        color: '#8B5CF6',
        position: [0, 1, 0],
    },
    'content-strategist': {
        label: 'Content Strategist',
        emoji: '📊',
        color: '#10B981',
        position: [-2.5, 0, 1.5],
    },
    'tweet-optimizer': {
        label: 'Tweet Optimizer',
        emoji: '✍️',
        color: '#F59E0B',
        position: [2.5, 0, 1.5],
    },
    'engagement-analyst': {
        label: 'Engagement Analyst',
        emoji: '📈',
        color: '#3B82F6',
        position: [-2.5, 0, -1.5],
    },
    'audience-scout': {
        label: 'Audience Scout',
        emoji: '👥',
        color: '#EC4899',
        position: [2.5, 0, -1.5],
    },
    'voice-calibrator': {
        label: 'Voice Calibrator',
        emoji: '🎭',
        color: '#14B8A6',
        position: [-1.5, -0.5, 0],
    },
    'schedule-commander': {
        label: 'Schedule Commander',
        emoji: '⏰',
        color: '#F97316',
        position: [1.5, -0.5, 0],
    },
};

// Single agent orb component
function AgentOrb({
    role,
    config,
    isActive,
    onClick,
}: {
    role: AgentRole;
    config: (typeof AGENT_CONFIG)[AgentRole];
    isActive: boolean;
    onClick: () => void;
}) {
    const orbRef = useRef<THREE.Mesh>(null);
    const ringRef = useRef<THREE.Mesh>(null);
    const [hovered, setHovered] = useState(false);

    // Animation
    useFrame((state) => {
        if (orbRef.current) {
            // Pulse effect when active
            const scale = isActive
                ? 1 + Math.sin(state.clock.elapsedTime * 3) * 0.1
                : 1;
            orbRef.current.scale.setScalar(scale);
        }

        if (ringRef.current) {
            ringRef.current.rotation.z = state.clock.elapsedTime * (isActive ? 2 : 0.5);
        }
    });

    return (
        <Float
            speed={2}
            rotationIntensity={0.2}
            floatIntensity={0.5}
            position={config.position}
        >
            <group
                onClick={onClick}
                onPointerOver={() => setHovered(true)}
                onPointerOut={() => setHovered(false)}
            >
                {/* Main orb */}
                <Sphere ref={orbRef} args={[0.4, 32, 32]}>
                    <MeshDistortMaterial
                        color={config.color}
                        attach="material"
                        distort={isActive ? 0.4 : 0.2}
                        speed={isActive ? 5 : 2}
                        roughness={0.2}
                        metalness={0.8}
                        emissive={config.color}
                        emissiveIntensity={isActive ? 0.5 : 0.2}
                    />
                </Sphere>

                {/* Outer ring */}
                <Ring
                    ref={ringRef}
                    args={[0.5, 0.55, 32]}
                    rotation={[Math.PI / 2, 0, 0]}
                >
                    <meshBasicMaterial
                        color={config.color}
                        transparent
                        opacity={isActive ? 0.8 : 0.3}
                        side={THREE.DoubleSide}
                    />
                </Ring>

                {/* Active indicator ring */}
                {isActive && (
                    <Ring args={[0.6, 0.62, 32]} rotation={[Math.PI / 2, 0, 0]}>
                        <meshBasicMaterial
                            color="#FFFFFF"
                            transparent
                            opacity={0.5}
                            side={THREE.DoubleSide}
                        />
                    </Ring>
                )}

                {/* Label */}
                {(hovered || isActive) && (
                    <Html center position={[0, 0.8, 0]} distanceFactor={10}>
                        <div
                            className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg backdrop-blur-md"
                            style={{
                                backgroundColor: 'rgba(0,0,0,0.7)',
                                border: `1px solid ${config.color}40`,
                                boxShadow: `0 0 20px ${config.color}30`,
                            }}
                        >
                            <span className="text-2xl">{config.emoji}</span>
                            <span
                                className="text-xs font-medium whitespace-nowrap"
                                style={{ color: config.color }}
                            >
                                {config.label}
                            </span>
                            {isActive && (
                                <span className="text-[10px] text-green-400 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                                    Active
                                </span>
                            )}
                        </div>
                    </Html>
                )}
            </group>
        </Float>
    );
}

// Connection lines between orchestrator and other agents
function ConnectionLines() {
    const linesRef = useRef<THREE.Group>(null);

    const lineObjects = useMemo(() => {
        const orchestratorPos = new THREE.Vector3(...AGENT_CONFIG.orchestrator.position);
        return (Object.entries(AGENT_CONFIG) as [AgentRole, typeof AGENT_CONFIG[AgentRole]][])
            .filter(([role]) => role !== 'orchestrator')
            .map(([role, config]) => {
                const points = [orchestratorPos, new THREE.Vector3(...config.position)];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const material = new THREE.LineBasicMaterial({
                    color: '#8B5CF6',
                    transparent: true,
                    opacity: 0.3
                });
                const line = new THREE.Line(geometry, material);
                return { role, line };
            });
    }, []);

    useFrame((state) => {
        lineObjects.forEach(({ line }, i) => {
            const mat = line.material as THREE.LineBasicMaterial;
            mat.opacity = 0.2 + Math.sin(state.clock.elapsedTime * 2 + i * 0.5) * 0.1;
        });
    });

    return (
        <group ref={linesRef}>
            {lineObjects.map(({ role, line }) => (
                <primitive key={role} object={line} />
            ))}
        </group>
    );
}

// Main AgentOrbs component
export function AgentOrbs() {
    const { activeAgent, setActiveAgent } = useAgentStore();

    return (
        <group>
            <ConnectionLines />
            {(Object.entries(AGENT_CONFIG) as [AgentRole, typeof AGENT_CONFIG[AgentRole]][]).map(
                ([role, config]) => (
                    <AgentOrb
                        key={role}
                        role={role}
                        config={config}
                        isActive={activeAgent === role}
                        onClick={() => setActiveAgent(activeAgent === role ? null : role)}
                    />
                )
            )}
        </group>
    );
}
