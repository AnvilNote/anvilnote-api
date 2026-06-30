import type { Request, Response } from "express";
import {
  createProjectSchema,
  projectIdParamsSchema,
  updateProjectSchema,
} from "./project.schemas";
import { ProjectService } from "./project.service";

const projectService = new ProjectService();

export class ProjectController {
  async list(_req: Request, res: Response) {
    const projects = await projectService.listProjects();

    res.json({
      data: projects,
      meta: {
        count: projects.length,
      },
    });
  }

  async create(req: Request, res: Response) {
    const input = createProjectSchema.parse(req.body);
    const project = await projectService.createProject(input);

    res.status(201).json({ data: project });
  }

  async update(req: Request, res: Response) {
    const { id } = projectIdParamsSchema.parse(req.params);
    const input = updateProjectSchema.parse(req.body);
    const project = await projectService.updateProject(id, input);

    res.json({ data: project });
  }

  async delete(req: Request, res: Response) {
    const { id } = projectIdParamsSchema.parse(req.params);
    const result = await projectService.deleteProject(id);

    res.json({ data: result });
  }
}
