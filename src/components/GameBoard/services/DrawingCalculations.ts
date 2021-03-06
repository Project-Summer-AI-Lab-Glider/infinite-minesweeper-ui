import * as p5 from "p5";
import { cloneDeep, range } from "lodash";
import { Point } from "../models/Point";
import { LinearFunction } from "../models/LinearFunction";
import { Intersection } from "../models/Intersection";
import { Node } from "../models/Node";
import { Segment } from "../models/Segment";

export class DrawingCalculations {
  constructor(private readonly p: p5) {}

  calculateGridLines(offsets: number[], gridSpace: number): LinearFunction[][] {
    const gridSlopes = this._calculateGridSlopes();

    return gridSlopes.map((a, i) => {
      const b = gridSpace * Math.sqrt(1 + Math.pow(a, 2));

      // TODO set range
      return range(-11, 11).map((j) => {
        const yT = j * b + offsets[i];
        return new LinearFunction(a, b, offsets[i], yT);
      });
    });
  }

  private _calculateGridSlopes(): number[] {
    return range(5)
      .map(
        (i): Point => {
          const x = Math.cos(Math.PI * i * 0.4);
          const y = Math.sin(Math.PI * i * 0.4);
          return { x, y };
        }
      )
      .map((point) => point.y / point.x);
  }

  calculateIntersections(
    functions: LinearFunction[][],
    gridSpace: number
  ): Intersection[] {
    let id = 1;
    const intersections: Intersection[] = [];

    for (const [i, f1Group] of functions.entries()) {
      for (const f1 of f1Group) {
        for (const [j, f2Group] of functions.entries()) {
          // Skip same functions groups
          if (i === j) continue;

          for (const f2 of f2Group) {
            const intersection = this.calculateLinesIntersection(
              f1,
              f2,
              gridSpace
            );

            // TODO skip duplicates
            const precision = 10000;
            const intersectionX =
              Math.round(intersection.x * precision) / precision;
            const intersectionY =
              Math.round(intersection.y * precision) / precision;

            const existingIntersection = intersections.find(
              (x: any) => x.x === intersectionX && x.y === intersectionY
            );

            if (existingIntersection) {
              continue;
            }

            intersections.push({
              id,
              x: intersectionX,
              y: intersectionY,
              f1: f1,
              f2: f2,
            });
            id++;
          }
        }
      }
    }

    return intersections;
  }

  private calculateLinesIntersection(
    // TODO investigate b
    f1: LinearFunction,
    f2: LinearFunction,
    gridSpace: number
  ): Point {
    const b1 = gridSpace * Math.sqrt(1 + Math.pow(f1.a, 2));
    const b2 = gridSpace * Math.sqrt(1 + Math.pow(f2.a, 2));
    const x =
      (b2 - b1 + f2.yT - f1.yT + f1.a * f1.xT - f2.a * f2.xT) / (f1.a - f2.a);
    const y = f1.a * (x - f1.xT) + b1 + f1.yT;

    return { x, y };
  }

  calculateNodesVertices(
    intersections: Intersection[],
    sideSize: number
  ): Node[] {
    return intersections.map((i, index: number) => {
      const diamondAngle = i.f1.calculateSlope(i.f2);

      const xT = 100; // TODO should be any int but doesnt work for 10
      const y12 = i.f1.evaluate(i.x + xT);
      const v1 = this.p.createVector(xT, y12 - i.y);

      const y22 = i.f2.evaluate(i.x + xT);
      const v2 = this.p.createVector(xT, y22 - i.y);

      v1.normalize();
      v2.normalize();
      v1.add(v2);

      v1.normalize();

      const d1 =
        2 * sideSize * Math.cos(((diamondAngle * Math.PI) / 180) * 0.5); // longer
      const d2 =
        2 * sideSize * Math.sin(((diamondAngle * Math.PI) / 180) * 0.5);

      const p1 = {
        x: i.x,
        y: i.y,
      };
      const p2 = {
        x: i.x + v1.x,
        y: i.y + v1.y,
      };
      const f1 = LinearFunction.createFromPoints(p1, p2);
      const angle1 = f1.calculateSlope(i.f1);
      const angle2 = f1.calculateSlope(i.f2);

      let angle = angle1 > angle2 ? angle2 : angle1;
      angle = Math.round(angle);

      let mul;
      let mul2;
      if (angle === 36 || angle === 18) {
        // 72 * 0.5 || 36 * 0.5
        // 36
        mul = d2 * 0.5;
        mul2 = d1 * 0.5;
      } else {
        // 72
        mul = d1 * 0.5;
        mul2 = d2 * 0.5;
      }

      // TODO use vectors
      const newA = -1 / f1.a;
      const f2 = LinearFunction.createFromSlopeAndPoint(newA, i);
      const v3 = this.p.createVector(xT, f2.evaluate(i.x + xT) - i.y);
      v3.normalize();
      v3.mult(mul2);
      v1.mult(mul);

      const diamondVertices = [];
      diamondVertices.push({ x: i.x + v1.x, y: i.y + v1.y });
      diamondVertices.push({ x: i.x + v3.x, y: i.y + v3.y });
      diamondVertices.push({ x: i.x - v1.x, y: i.y - v1.y });
      diamondVertices.push({ x: i.x - v3.x, y: i.y - v3.y });

      return {
        id: i.id,
        intersection: i,
        center: {
          x: i.x,
          y: i.y,
        },
        oldCenter: {
          x: i.x,
          y: i.y,
        },
        vertices: diamondVertices,
        oldVertices: cloneDeep(diamondVertices),
        connections: [],
        angle: diamondAngle,
        isMoved: false,
      };
    });
  }

  bindNodes(functions: LinearFunction[][], nodes: Node[]) {
    functions.forEach((group) => {
      group.forEach((f) => {
        // TODO
        const functionNodes = nodes.filter(
          (node) =>
            (node.intersection.f1.a === f.a &&
              node.intersection.f1.b === f.b &&
              node.intersection.f1.xT === f.xT &&
              node.intersection.f1.yT === f.yT) ||
            (node.intersection.f2.a === f.a &&
              node.intersection.f2.b === f.b &&
              node.intersection.f2.xT === f.xT &&
              node.intersection.f2.yT === f.yT)
        );

        functionNodes.sort((node1, node2) =>
          node1.intersection.x < node2.intersection.x ? -1 : 1
        );

        let lastRef: any = functionNodes.shift();
        functionNodes.forEach((node) => {
          lastRef.connections.push(node);
          node.connections.push(lastRef);
          lastRef = node;
        });
      });
    });
  }

  findFirstGridNode(nodes: Node[]) {
    return nodes.reduce((n1, n2) => {
      const aLen = this.p.createVector(n1.center.x, n1.center.y).mag();
      const bLen = this.p.createVector(n2.center.x, n2.center.y).mag();
      return aLen < bLen ? n1 : n2;
    });
  }

  connectNodesVertices(mainNode: Node, nextNode: Node, sideSize: number): void {
    const baseTranslation = this.getNodesLineTranslation(
      mainNode,
      nextNode,
      sideSize
    ); // TODO investigate

    let newVertices = nextNode.oldVertices.map((vertice) => {
      return {
        x: vertice.x + baseTranslation.x,
        y: vertice.y + baseTranslation.y,
      };
    });

    const t1 = this.getClosestPointsTranslation(
      mainNode.oldVertices,
      newVertices
    );
    let translation = cloneDeep(baseTranslation).add(t1);

    let matches = 0;
    const baseVert = cloneDeep(newVertices);
    newVertices = baseVert.map((point: Point, z) => {
      const newX = point.x + t1.x;
      const newY = point.y + t1.y;

      const isPointMatching = this.arePointsEqual(mainNode, newX, newY);
      if (isPointMatching) {
        matches++;
      }

      return { x: newX, y: newY };
    });

    // if (nextNode.id === 210) {
    //   nextNode.translation = cloneDeep(mainNode.translation as any).add(
    //     this.p.createVector(0, 0)
    //   );
    //   nextNode.vertices = newVertices;
    //   nextNode.isMoved = true;
    //   return;
    // }

    if (matches === 1) {
      newVertices = baseVert.map((vertice) => {
        // base vertices
        return { x: vertice.x - t1.x, y: vertice.y - t1.y };
      });

      const t2 = this.getClosestPointsTranslation(
        mainNode.oldVertices,
        newVertices
      );
      translation = cloneDeep(baseTranslation).sub(t1).add(t2);
      newVertices = newVertices.map((point: Point) => {
        const newX = point.x + t2.x;
        const newY = point.y + t2.y;
        return { x: newX, y: newY };
      });
    }

    nextNode.translation = cloneDeep(mainNode.translation as any).add(
      translation
    );
    newVertices = newVertices.map((v) => {
      return {
        x: v.x + (mainNode.translation as any).x,
        y: v.y + (mainNode.translation as any).y,
      };
    });

    nextNode.center = {
      x: nextNode.oldCenter.x + (nextNode.translation as any).x,
      y: nextNode.oldCenter.y + (nextNode.translation as any).y,
    };
    nextNode.vertices = newVertices;
    nextNode.isMoved = true;
  }

  private arePointsEqual(mainNode: Node, x: number, y: number) {
    if (mainNode.id === 217) {
      console.log("~~~~~~~~~~~~~~~~~~~~~~~~");
      console.log("x", x);
      console.log("y", y);
    }

    return mainNode.oldVertices.find((vertice, z) => {
      if (mainNode.id === 217) {
        console.log("x" + z, vertice.x);
        console.log("y" + z, vertice.y);
      }

      const accuracy = 100;
      const isEqual =
        Math.round(vertice.x * accuracy) === Math.round(x * accuracy) &&
        Math.round(vertice.y * accuracy) === Math.round(y * accuracy);
      if (mainNode.id === 217) {
        console.log("isEqual", isEqual);
      }

      return isEqual;
    });
  }

  private getNodesLineTranslation(
    mainNode: Node,
    nextNode: Node,
    sideSize: number
  ): p5.Vector {
    const nodesTranslation = this.p.createVector(
      nextNode.oldCenter.x - mainNode.oldCenter.x,
      nextNode.oldCenter.y - mainNode.oldCenter.y
    );
    const centersDistance = nodesTranslation.mag();
    nodesTranslation.normalize();

    const h1 = sideSize * Math.sin((mainNode.angle * Math.PI) / 180);
    const h2 = sideSize * Math.sin((nextNode.angle * Math.PI) / 180);
    let distance = centersDistance - (h1 + h2) * 0.5;

    nodesTranslation.mult(-distance);

    return nodesTranslation;
  }

  private getClosestPointsTranslation(
    vertices1: Point[],
    vertices2: Point[]
  ): p5.Vector {
    const segments: Segment[] = [];
    vertices1.forEach((p1) => {
      vertices2.forEach((p2) => {
        const length = this.p.createVector(p2.x - p1.x, p2.y - p1.y).mag();
        segments.push({ p1, p2, length });
      });
    });

    segments.sort((a, b) => (a.length < b.length ? -1 : 1));

    const xT = segments[0].p1.x - segments[0].p2.x;
    const yT = segments[0].p1.y - segments[0].p2.y;

    return this.p.createVector(xT, yT);
  }

  static isPointInsidePolygon(point: Point, vertices: Point[]): boolean {
    let isInside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const intersect =
        vertices[i].y > point.y !== vertices[j].y > point.y &&
        point.x <
          ((vertices[j].x - vertices[i].x) * (point.y - vertices[i].y)) /
            (vertices[j].y - vertices[i].y) +
            vertices[i].x;

      if (intersect) isInside = !isInside;
    }

    return isInside;
  }
}
