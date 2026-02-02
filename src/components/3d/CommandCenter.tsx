'use client';

/**
 * CryptoAgentHQ - Command Center Scene
 * Main 3D WebGL scene using React Three Fiber
 */

import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
    OrbitControls,
    Environment,
    Float,
    Text3D,
    Center,
    PerspectiveCamera,
    Stars,
} from '@react-three/drei';
import * as THREE from 'three';
import { AgentOrbs } from './AgentOrbs';

// Loading fallback
function LoadingFallback() {
    return (
        <mesh>
            <sphereGeometry args={[0.5, 32, 32]} />
            <meshBasicMaterial color="#8B5CF6" wireframe />
        </mesh>
    );
}

// Animated grid floor
function GridFloor() {
    const ref = useRef<THREE.GridHelper>(null);

    useFrame((state) => {
        if (ref.current) {
            ref.current.position.z = (state.clock.elapsedTime * 0.5) % 1;
        }
    });

    return (
        <group position={[0, -2, 0]}>
            <gridHelper
                ref={ref}
                args={[100, 100, '#4F46E5', '#1E1B4B']}
                rotation={[0, 0, 0]}
            />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
                <planeGeometry args={[100, 100]} />
                <meshBasicMaterial
                    color="#0A0A1A"
                    transparent
                    opacity={0.95}
                />
            </mesh>
        </group>
    );
}

// Holographic center ring
function HolographicRing() {
    const ringRef = useRef<THREE.Mesh>(null);

    useFrame((state) => {
        if (ringRef.current) {
            ringRef.current.rotation.z = state.clock.elapsedTime * 0.2;
        }
    });

    return (
        <Float speed={2} rotationIntensity={0.1} floatIntensity={0.5}>
            <mesh ref={ringRef} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[3, 0.02, 16, 64]} />
                <meshBasicMaterial color="#8B5CF6" transparent opacity={0.8} />
            </mesh>
            <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[3.5, 0.01, 16, 64]} />
                <meshBasicMaterial color="#6366F1" transparent opacity={0.5} />
            </mesh>
        </Float>
    );
}

// Main scene content
function SceneContent() {
    return (
        <>
            {/* Camera */}
            <PerspectiveCamera makeDefault position={[0, 2, 8]} fov={60} />

            {/* Controls */}
            <OrbitControls
                enablePan={false}
                minDistance={5}
                maxDistance={15}
                maxPolarAngle={Math.PI / 2}
                target={[0, 0, 0]}
            />

            {/* Lighting */}
            <ambientLight intensity={0.3} />
            <pointLight position={[10, 10, 10]} intensity={1} color="#8B5CF6" />
            <pointLight position={[-10, -10, -10]} intensity={0.5} color="#6366F1" />
            <spotLight
                position={[0, 10, 0]}
                angle={0.3}
                penumbra={1}
                intensity={1}
                color="#A78BFA"
                castShadow
            />

            {/* Background */}
            <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={0.5} />
            <color attach="background" args={['#050510']} />

            {/* Scene elements */}
            <GridFloor />
            <HolographicRing />

            {/* Agent orbs */}
            <Suspense fallback={<LoadingFallback />}>
                <AgentOrbs />
            </Suspense>
        </>
    );
}

// Main Command Center component
export function CommandCenter() {
    return (
        <div className="absolute inset-0 z-0">
            <Canvas
                shadows
                gl={{
                    antialias: true,
                    alpha: false,
                    powerPreference: 'high-performance',
                    // iOS optimization
                    preserveDrawingBuffer: true,
                }}
                dpr={[1, 2]} // Responsive DPR
            >
                <Suspense fallback={<LoadingFallback />}>
                    <SceneContent />
                </Suspense>
            </Canvas>
        </div>
    );
}
