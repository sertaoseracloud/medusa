import express from "express";
import SessionService from "../services/session.service";

const SessionController = {
    async create (req: express.Request, res: express.Response) {
    try {
      const { email, password } = req.body;

      const data = await SessionService({ email, password });

      if(data.error) {
        return res.status(data.status).json({
          data: {},
          message: data.error,
          timestamp: new Date().toISOString(),
        });
      }

      res.status(data.status).json({
        data,
        message: "Success",
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      throw new Error(error);
    }
  },
}

export default SessionController;